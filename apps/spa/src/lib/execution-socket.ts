import { io, type Socket } from 'socket.io-client';
import type { ExecutionEventEnvelope } from '@tietide/shared';

const WS_PATH = '/v1/ws/executions';

export type ExecutionEventListener = (envelope: ExecutionEventEnvelope) => void;
export type ExecutionErrorListener = (error: { message: string }) => void;

export interface ExecutionSocketConnectOptions {
  url?: string;
}

export interface ExecutionSocket {
  connect: (token: string, options?: ExecutionSocketConnectOptions) => void;
  subscribe: (executionId: string) => void;
  unsubscribe: (executionId: string) => void;
  disconnect: () => void;
  onEvent: (listener: ExecutionEventListener) => () => void;
  onError: (listener: ExecutionErrorListener) => () => void;
  isConnected: () => boolean;
}

const resolveOrigin = (override?: string): string | undefined => {
  if (override) return override;
  // Vite injects import.meta.env at build time; use the configured API URL's
  // origin for the WS connection (the path is /v1/ws/executions).
  const env =
    (typeof import.meta !== 'undefined' && (import.meta as ImportMeta).env?.VITE_API_URL) ||
    undefined;
  if (!env) return undefined;
  try {
    return new URL(env).origin;
  } catch {
    return undefined;
  }
};

class ExecutionSocketImpl implements ExecutionSocket {
  private socket: Socket | null = null;
  private subscribedId: string | null = null;
  private readonly eventListeners = new Set<ExecutionEventListener>();
  private readonly errorListeners = new Set<ExecutionErrorListener>();

  connect(token: string, options: ExecutionSocketConnectOptions = {}): void {
    if (this.socket) return;

    const origin = resolveOrigin(options.url);
    this.socket = io(origin, {
      path: WS_PATH,
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('event', (envelope: ExecutionEventEnvelope) => {
      for (const listener of this.eventListeners) listener(envelope);
    });

    this.socket.on('error', (payload: { message: string }) => {
      for (const listener of this.errorListeners) listener(payload);
    });

    this.socket.io.on('reconnect', () => {
      if (this.subscribedId && this.socket) {
        this.socket.emit('subscribe', { executionId: this.subscribedId });
      }
    });
  }

  subscribe(executionId: string): void {
    this.subscribedId = executionId;
    this.socket?.emit('subscribe', { executionId });
  }

  unsubscribe(executionId: string): void {
    this.socket?.emit('unsubscribe', { executionId });
    if (this.subscribedId === executionId) {
      this.subscribedId = null;
    }
  }

  disconnect(): void {
    this.subscribedId = null;
    this.socket?.disconnect();
    this.socket = null;
  }

  onEvent(listener: ExecutionEventListener): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  onError(listener: ExecutionErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  isConnected(): boolean {
    return this.socket !== null;
  }
}

export const createExecutionSocket = (): ExecutionSocket => new ExecutionSocketImpl();

export const executionSocket: ExecutionSocket = createExecutionSocket();
