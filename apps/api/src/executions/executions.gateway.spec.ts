import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test, type TestingModule } from '@nestjs/testing';
import { Logger as PinoLogger } from 'nestjs-pino';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type { ExecutionEventEnvelope } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  EXECUTION_EVENTS_SUBSCRIBER,
  type ExecutionEventsSubscriber,
  type ExecutionEventHandler,
} from './execution-events.subscriber';
import { ExecutionsGateway } from './executions.gateway';

const TEST_JWT_SECRET = 'test-secret-execution-gateway-spec';
const GATEWAY_PATH = '/v1/ws/executions';

const OWNER_ID = '00000000-0000-4000-8000-000000000001';
const STRANGER_ID = '00000000-0000-4000-8000-000000000002';
const EXECUTION_ID = '11111111-1111-4111-8111-111111111111';
const FOREIGN_EXECUTION_ID = '22222222-2222-4222-8222-222222222222';

class InMemorySubscriber implements ExecutionEventsSubscriber {
  private readonly handlers = new Map<string, Set<ExecutionEventHandler>>();
  public subscribeCalls = 0;
  public unsubscribeCalls = 0;

  async subscribe(executionId: string, handler: ExecutionEventHandler): Promise<void> {
    let set = this.handlers.get(executionId);
    if (!set) {
      set = new Set();
      this.handlers.set(executionId, set);
      this.subscribeCalls += 1;
    }
    set.add(handler);
  }

  async unsubscribe(executionId: string, handler: ExecutionEventHandler): Promise<void> {
    const set = this.handlers.get(executionId);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) {
      this.handlers.delete(executionId);
      this.unsubscribeCalls += 1;
    }
  }

  handlerCount(executionId: string): number {
    return this.handlers.get(executionId)?.size ?? 0;
  }

  simulate(executionId: string, envelope: ExecutionEventEnvelope): void {
    for (const handler of this.handlers.get(executionId) ?? []) {
      handler(envelope);
    }
  }
}

const sampleEnvelope: ExecutionEventEnvelope = {
  type: 'step.completed',
  executionId: EXECUTION_ID,
  nodeId: 'node-a',
  nodeType: 'http-request',
  status: 'SUCCESS',
  startedAt: '2026-05-06T10:00:00.000Z',
  finishedAt: '2026-05-06T10:00:01.000Z',
  durationMs: 1000,
  input: { url: 'https://example.com' },
  output: { status: 200 },
  error: null,
};

function waitForEvent<T = unknown>(
  socket: ClientSocket,
  event: string,
  timeoutMs = 1500,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      socket.off(event);
      reject(new Error(`timeout waiting for "${event}"`));
    }, timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(t);
      resolve(payload);
    });
  });
}

function waitForDisconnect(socket: ClientSocket, timeoutMs = 1500): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for disconnect')), timeoutMs);
    socket.once('disconnect', (reason: string) => {
      clearTimeout(t);
      resolve(reason);
    });
  });
}

function expectNoEvent(socket: ClientSocket, event: string, withinMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const handler = (payload: unknown): void => {
      reject(new Error(`unexpected "${event}" received: ${JSON.stringify(payload)}`));
    };
    socket.on(event, handler);
    setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, withinMs);
  });
}

describe('ExecutionsGateway (integration)', () => {
  let app: INestApplication;
  let port: number;
  let jwtService: JwtService;
  let subscriber: InMemorySubscriber;
  let prisma: { workflowExecution: { findUnique: jest.Mock } };
  let openClients: ClientSocket[];

  beforeEach(async () => {
    subscriber = new InMemorySubscriber();
    prisma = {
      workflowExecution: { findUnique: jest.fn() },
    };

    const mod: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      providers: [
        ExecutionsGateway,
        { provide: PrismaService, useValue: prisma },
        { provide: EXECUTION_EVENTS_SUBSCRIBER, useValue: subscriber },
        {
          provide: PinoLogger,
          useValue: {
            log: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            verbose: jest.fn(),
            fatal: jest.fn(),
          },
        },
      ],
    }).compile();

    app = mod.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.init();
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as AddressInfo).port;

    jwtService = mod.get(JwtService);
    openClients = [];
  });

  afterEach(async () => {
    for (const c of openClients) {
      if (c.connected) c.disconnect();
    }
    await app.close();
  });

  function connect(token?: string): ClientSocket {
    const client = ioClient(`http://127.0.0.1:${port}`, {
      path: GATEWAY_PATH,
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      auth: token ? { token } : {},
    });
    openClients.push(client);
    return client;
  }

  function signOwnerToken(): string {
    return jwtService.sign({ sub: OWNER_ID, email: 'owner@example.com', role: 'USER' });
  }

  describe('handleConnection', () => {
    it('should reject a connection with no token', async () => {
      const client = connect();
      const reason = await waitForDisconnect(client, 2000);
      expect(reason).toBeDefined();
      expect(client.connected).toBe(false);
    });

    it('should reject a connection with an invalid token', async () => {
      const client = connect('not-a-real-jwt');
      const reason = await waitForDisconnect(client, 2000);
      expect(reason).toBeDefined();
      expect(client.connected).toBe(false);
    });

    it('should accept a connection with a valid token', async () => {
      const client = connect(signOwnerToken());
      await waitForEvent(client, 'connect', 2000);
      expect(client.connected).toBe(true);
    });
  });

  describe('subscribe', () => {
    it('should error and not subscribe when execution belongs to another user', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        workflow: { userId: STRANGER_ID },
      });

      const client = connect(signOwnerToken());
      await waitForEvent(client, 'connect');

      const errPromise = waitForEvent<{ message: string }>(client, 'error', 2000);
      client.emit('subscribe', { executionId: FOREIGN_EXECUTION_ID });
      const err = await errPromise;

      expect(err.message).toMatch(/forbidden|unauthorized/i);
      expect(subscriber.handlerCount(FOREIGN_EXECUTION_ID)).toBe(0);
    });

    it('should error when the execution does not exist', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue(null);

      const client = connect(signOwnerToken());
      await waitForEvent(client, 'connect');

      const errPromise = waitForEvent<{ message: string }>(client, 'error', 2000);
      client.emit('subscribe', { executionId: EXECUTION_ID });
      await errPromise;

      expect(subscriber.handlerCount(EXECUTION_ID)).toBe(0);
    });

    it('should subscribe to an owned execution', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        workflow: { userId: OWNER_ID },
      });

      const client = connect(signOwnerToken());
      await waitForEvent(client, 'connect');

      client.emit('subscribe', { executionId: EXECUTION_ID });

      // Allow the async handler to resolve.
      await new Promise((r) => setTimeout(r, 100));

      expect(subscriber.handlerCount(EXECUTION_ID)).toBe(1);
      expect(prisma.workflowExecution.findUnique).toHaveBeenCalledWith({
        where: { id: EXECUTION_ID },
        select: { workflow: { select: { userId: true } } },
      });
    });

    it('should be idempotent when the same socket subscribes twice', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        workflow: { userId: OWNER_ID },
      });

      const client = connect(signOwnerToken());
      await waitForEvent(client, 'connect');

      client.emit('subscribe', { executionId: EXECUTION_ID });
      await new Promise((r) => setTimeout(r, 50));
      client.emit('subscribe', { executionId: EXECUTION_ID });
      await new Promise((r) => setTimeout(r, 50));

      expect(subscriber.handlerCount(EXECUTION_ID)).toBe(1);
    });
  });

  describe('event forwarding', () => {
    it('should forward a published envelope to the subscribed socket as "event"', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        workflow: { userId: OWNER_ID },
      });

      const client = connect(signOwnerToken());
      await waitForEvent(client, 'connect');
      client.emit('subscribe', { executionId: EXECUTION_ID });
      await new Promise((r) => setTimeout(r, 50));

      const received = waitForEvent<ExecutionEventEnvelope>(client, 'event', 2000);
      subscriber.simulate(EXECUTION_ID, sampleEnvelope);
      const envelope = await received;

      expect(envelope).toEqual(sampleEnvelope);
    });

    it('should fan out to multiple sockets subscribed to the same execution', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        workflow: { userId: OWNER_ID },
      });

      const a = connect(signOwnerToken());
      const b = connect(signOwnerToken());
      await Promise.all([waitForEvent(a, 'connect'), waitForEvent(b, 'connect')]);

      a.emit('subscribe', { executionId: EXECUTION_ID });
      b.emit('subscribe', { executionId: EXECUTION_ID });
      await new Promise((r) => setTimeout(r, 100));

      expect(subscriber.handlerCount(EXECUTION_ID)).toBe(2);
      expect(subscriber.subscribeCalls).toBe(1); // upstream Redis SUBSCRIBE issued only once

      const got = Promise.all([
        waitForEvent<ExecutionEventEnvelope>(a, 'event', 2000),
        waitForEvent<ExecutionEventEnvelope>(b, 'event', 2000),
      ]);
      subscriber.simulate(EXECUTION_ID, sampleEnvelope);
      const [eA, eB] = await got;

      expect(eA).toEqual(sampleEnvelope);
      expect(eB).toEqual(sampleEnvelope);
    });
  });

  describe('unsubscribe', () => {
    it('should leave the channel and stop receiving events', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        workflow: { userId: OWNER_ID },
      });

      const client = connect(signOwnerToken());
      await waitForEvent(client, 'connect');
      client.emit('subscribe', { executionId: EXECUTION_ID });
      await new Promise((r) => setTimeout(r, 50));

      client.emit('unsubscribe', { executionId: EXECUTION_ID });
      await new Promise((r) => setTimeout(r, 100));

      expect(subscriber.handlerCount(EXECUTION_ID)).toBe(0);

      const noEvent = expectNoEvent(client, 'event', 200);
      subscriber.simulate(EXECUTION_ID, sampleEnvelope);
      await noEvent;
    });
  });

  describe('handleDisconnect', () => {
    it('should clean up all subscriptions when a socket disconnects', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        workflow: { userId: OWNER_ID },
      });

      const client = connect(signOwnerToken());
      await waitForEvent(client, 'connect');
      client.emit('subscribe', { executionId: EXECUTION_ID });
      await new Promise((r) => setTimeout(r, 100));
      expect(subscriber.handlerCount(EXECUTION_ID)).toBe(1);

      client.disconnect();
      await new Promise((r) => setTimeout(r, 200));

      expect(subscriber.handlerCount(EXECUTION_ID)).toBe(0);
    });
  });
});
