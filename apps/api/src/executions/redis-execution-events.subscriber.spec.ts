import type { Logger as PinoLogger } from 'nestjs-pino';
import type { ExecutionEventEnvelope } from '@tietide/shared';
import {
  RedisExecutionEventsSubscriber,
  type RedisSubscriberClient,
} from './redis-execution-events.subscriber';

interface FakeRedis extends RedisSubscriberClient {
  subscribed: Set<string>;
  emit(channel: string, message: string): void;
  triggerError(err: Error): void;
}

function makeFakeRedis(): FakeRedis {
  const subscribed = new Set<string>();
  const listeners: Array<(channel: string, message: string) => void> = [];
  const errorListeners: Array<(err: Error) => void> = [];

  const fake: FakeRedis = {
    subscribed,
    subscribe: jest.fn(async (...channels: string[]): Promise<number> => {
      for (const c of channels) subscribed.add(c);
      return subscribed.size;
    }),
    unsubscribe: jest.fn(async (...channels: string[]): Promise<number> => {
      for (const c of channels) subscribed.delete(c);
      return subscribed.size;
    }),
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'message') {
        listeners.push(handler as (channel: string, message: string) => void);
      } else if (event === 'error') {
        errorListeners.push(handler as (err: Error) => void);
      }
      return fake;
    }),
    quit: jest.fn(async (): Promise<'OK'> => 'OK'),
    emit: (channel, message) => {
      for (const l of listeners) l(channel, message);
    },
    triggerError: (err) => {
      for (const l of errorListeners) l(err);
    },
  };
  return fake;
}

const noopLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  fatal: jest.fn(),
} as unknown as PinoLogger;

const sampleEnvelope: ExecutionEventEnvelope = {
  type: 'step.started',
  executionId: 'exec-1',
  nodeId: 'n1',
  nodeType: 'http-request',
  status: 'RUNNING',
  startedAt: '2026-05-06T10:00:00.000Z',
  finishedAt: null,
  durationMs: null,
  input: null,
  output: null,
  error: null,
};

describe('RedisExecutionEventsSubscriber', () => {
  describe('subscribe', () => {
    it('should call ioredis.subscribe only once when multiple handlers are added for the same execution', async () => {
      const fake = makeFakeRedis();
      const sub = new RedisExecutionEventsSubscriber(fake, noopLogger);

      await sub.subscribe('exec-1', () => {});
      await sub.subscribe('exec-1', () => {});

      expect(fake.subscribe).toHaveBeenCalledTimes(1);
      expect(fake.subscribe).toHaveBeenCalledWith('exec:exec-1');
    });

    it('should call ioredis.subscribe again for a different channel', async () => {
      const fake = makeFakeRedis();
      const sub = new RedisExecutionEventsSubscriber(fake, noopLogger);

      await sub.subscribe('exec-1', () => {});
      await sub.subscribe('exec-2', () => {});

      expect(fake.subscribe).toHaveBeenCalledTimes(2);
      expect(fake.subscribed).toEqual(new Set(['exec:exec-1', 'exec:exec-2']));
    });
  });

  describe('unsubscribe', () => {
    it('should call ioredis.unsubscribe when the last handler for a channel is removed', async () => {
      const fake = makeFakeRedis();
      const sub = new RedisExecutionEventsSubscriber(fake, noopLogger);
      const handler = (): void => {};

      await sub.subscribe('exec-1', handler);
      await sub.unsubscribe('exec-1', handler);

      expect(fake.unsubscribe).toHaveBeenCalledWith('exec:exec-1');
      expect(fake.subscribed.size).toBe(0);
    });

    it('should NOT call ioredis.unsubscribe while other handlers remain', async () => {
      const fake = makeFakeRedis();
      const sub = new RedisExecutionEventsSubscriber(fake, noopLogger);
      const a = (): void => {};
      const b = (): void => {};

      await sub.subscribe('exec-1', a);
      await sub.subscribe('exec-1', b);
      await sub.unsubscribe('exec-1', a);

      expect(fake.unsubscribe).not.toHaveBeenCalled();

      await sub.unsubscribe('exec-1', b);
      expect(fake.unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('should be a no-op for an unknown handler', async () => {
      const fake = makeFakeRedis();
      const sub = new RedisExecutionEventsSubscriber(fake, noopLogger);

      await expect(sub.unsubscribe('exec-1', () => {})).resolves.not.toThrow();
      expect(fake.unsubscribe).not.toHaveBeenCalled();
    });
  });

  describe('message routing', () => {
    it('should parse incoming Redis messages and dispatch to all handlers for the channel', async () => {
      const fake = makeFakeRedis();
      const sub = new RedisExecutionEventsSubscriber(fake, noopLogger);

      const handlerA = jest.fn();
      const handlerB = jest.fn();
      await sub.subscribe('exec-1', handlerA);
      await sub.subscribe('exec-1', handlerB);

      fake.emit('exec:exec-1', JSON.stringify(sampleEnvelope));

      expect(handlerA).toHaveBeenCalledWith(sampleEnvelope);
      expect(handlerB).toHaveBeenCalledWith(sampleEnvelope);
    });

    it('should ignore messages on channels with no registered handlers', async () => {
      const fake = makeFakeRedis();
      new RedisExecutionEventsSubscriber(fake, noopLogger);

      // No subscribers — must not throw.
      expect(() => fake.emit('exec:none', JSON.stringify(sampleEnvelope))).not.toThrow();
    });

    it('should ignore malformed JSON without crashing', async () => {
      const fake = makeFakeRedis();
      const sub = new RedisExecutionEventsSubscriber(fake, noopLogger);
      const handler = jest.fn();
      await sub.subscribe('exec-1', handler);

      expect(() => fake.emit('exec:exec-1', 'not-json')).not.toThrow();
      expect(handler).not.toHaveBeenCalled();
    });

    it('should ignore messages on channels that do not match the exec: prefix', async () => {
      const fake = makeFakeRedis();
      const sub = new RedisExecutionEventsSubscriber(fake, noopLogger);
      const handler = jest.fn();
      await sub.subscribe('exec-1', handler);

      fake.emit('other:channel', JSON.stringify(sampleEnvelope));
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('should quit the underlying Redis connection', async () => {
      const fake = makeFakeRedis();
      const sub = new RedisExecutionEventsSubscriber(fake, noopLogger);
      await sub.onModuleDestroy();
      expect(fake.quit).toHaveBeenCalled();
    });
  });
});
