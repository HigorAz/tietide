import { Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { isUUID } from 'class-validator';
import { Logger } from 'nestjs-pino';
import type { Server, Socket } from 'socket.io';
import type { ExecutionEventEnvelope } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import {
  EXECUTION_EVENTS_SUBSCRIBER,
  type ExecutionEventHandler,
  type ExecutionEventsSubscriber,
} from './execution-events.subscriber';

interface AuthedUser {
  id: string;
  email: string;
  role: string;
}

interface SocketState {
  user: AuthedUser;
  subscriptions: Set<string>;
  handler: ExecutionEventHandler;
}

interface AuthedSocket extends Socket {
  data: SocketState;
}

interface SubscribePayload {
  executionId?: unknown;
}

@WebSocketGateway({
  path: '/v1/ws/executions',
  cors: {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  },
  serveClient: false,
})
export class ExecutionsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  // socket.io-injected server instance — currently unused but exposed for
  // future broadcasts (e.g. admin-initiated cancellations).
  declare server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    @Inject(EXECUTION_EVENTS_SUBSCRIBER)
    private readonly subscriber: ExecutionEventsSubscriber,
    private readonly logger: Logger,
  ) {}

  async handleConnection(socket: Socket): Promise<void> {
    const token = this.extractToken(socket);
    if (!token) {
      this.rejectConnection(socket, 'Missing token');
      return;
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      this.rejectConnection(socket, 'Invalid token');
      return;
    }

    if (payload.aud === 'oauth-state' || !payload.sub || !payload.email || !payload.role) {
      this.rejectConnection(socket, 'Invalid token');
      return;
    }

    const user: AuthedUser = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    const handler: ExecutionEventHandler = (envelope) => {
      socket.emit('event', envelope);
    };
    (socket as AuthedSocket).data = {
      user,
      subscriptions: new Set<string>(),
      handler,
    };
    this.logger.log({ userId: user.id, socketId: socket.id }, 'WS connected');
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const state = (socket as AuthedSocket).data;
    if (!state || !state.subscriptions) return;
    for (const executionId of state.subscriptions) {
      try {
        await this.subscriber.unsubscribe(executionId, state.handler);
      } catch (err) {
        this.logger.warn(
          { socketId: socket.id, executionId, err: (err as Error).message },
          'Failed to unsubscribe on disconnect',
        );
      }
    }
    state.subscriptions.clear();
    this.logger.log({ userId: state.user?.id, socketId: socket.id }, 'WS disconnected');
  }

  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: SubscribePayload,
  ): Promise<void> {
    const state = (socket as AuthedSocket).data;
    if (!state) return;

    const executionId = this.parseExecutionId(body);
    if (!executionId) {
      socket.emit('error', { message: 'Invalid executionId' });
      return;
    }

    const allowed = await this.assertMembership(executionId, state.user.id);
    if (!allowed) {
      socket.emit('error', { message: 'Forbidden' });
      return;
    }

    if (state.subscriptions.has(executionId)) return;

    try {
      await this.subscriber.subscribe(executionId, state.handler);
      state.subscriptions.add(executionId);
    } catch (err) {
      this.logger.warn(
        { userId: state.user.id, executionId, err: (err as Error).message },
        'Failed to subscribe to execution channel',
      );
      socket.emit('error', { message: 'Subscribe failed' });
    }
  }

  @SubscribeMessage('unsubscribe')
  async handleUnsubscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: SubscribePayload,
  ): Promise<void> {
    const state = (socket as AuthedSocket).data;
    if (!state) return;

    const executionId = this.parseExecutionId(body);
    if (!executionId || !state.subscriptions.has(executionId)) return;

    try {
      await this.subscriber.unsubscribe(executionId, state.handler);
    } catch (err) {
      this.logger.warn(
        { userId: state.user.id, executionId, err: (err as Error).message },
        'Failed to unsubscribe from execution channel',
      );
    }
    state.subscriptions.delete(executionId);
  }

  private extractToken(socket: Socket): string | null {
    const authToken = socket.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }
    const header = socket.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length);
    }
    return null;
  }

  private rejectConnection(socket: Socket, message: string): void {
    socket.emit('error', { message: 'Unauthorized' });
    socket.disconnect(true);
    this.logger.log({ socketId: socket.id, reason: message }, 'WS rejected');
  }

  private parseExecutionId(body: SubscribePayload): string | null {
    const candidate = body?.executionId;
    if (typeof candidate !== 'string' || !isUUID(candidate)) return null;
    return candidate;
  }

  // Defence-in-depth: the WS handshake only proves identity (JWT). Before joining
  // an execution's event channel we additionally require that the caller is a
  // member of the organization that owns the execution's workflow — mirroring the
  // HTTP OrgContextGuard, since the socket carries no validated X-Org-Id.
  private async assertMembership(executionId: string, userId: string): Promise<boolean> {
    const row = await this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
      select: { workflow: { select: { organizationId: true } } },
    });
    if (!row) return false;

    const membership = await this.prisma.organizationMember.findFirst({
      where: { organizationId: row.workflow.organizationId, userId },
      select: { id: true },
    });
    return !!membership;
  }
}

// Re-emit the envelope shape for downstream consumers that import the gateway.
export type { ExecutionEventEnvelope };
