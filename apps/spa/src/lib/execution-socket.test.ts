import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ExecutionEventEnvelope } from '@tietide/shared';

const mockSocket = {
  emit: vi.fn(),
  on: vi.fn(),
  disconnect: vi.fn(),
  io: { on: vi.fn() },
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

import { io } from 'socket.io-client';
import { createExecutionSocket } from './execution-socket';

const triggerSocketEvent = (event: string, payload?: unknown): void => {
  for (const call of mockSocket.on.mock.calls) {
    const [name, handler] = call as [string, (p: unknown) => void];
    if (name === event) handler(payload);
  }
};

const triggerManagerEvent = (event: string, payload?: unknown): void => {
  for (const call of mockSocket.io.on.mock.calls) {
    const [name, handler] = call as [string, (p: unknown) => void];
    if (name === event) handler(payload);
  }
};

describe('executionSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('connect', () => {
    it('should call io() with the gateway path and JWT auth token', () => {
      const socket = createExecutionSocket();
      socket.connect('jwt-token-1');

      expect(io).toHaveBeenCalledTimes(1);
      const opts = (io as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(opts.path).toBe('/v1/ws/executions');
      expect(opts.auth).toEqual({ token: 'jwt-token-1' });
    });

    it('should be a no-op on second connect call', () => {
      const socket = createExecutionSocket();
      socket.connect('jwt');
      socket.connect('jwt');
      expect(io).toHaveBeenCalledTimes(1);
    });

    it('should configure reconnection so attempts happen within 5 seconds', () => {
      const socket = createExecutionSocket();
      socket.connect('jwt');

      const opts = (io as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as {
        reconnection: boolean;
        reconnectionDelay: number;
        reconnectionDelayMax: number;
      };
      expect(opts.reconnection).toBe(true);
      expect(opts.reconnectionDelay).toBeLessThanOrEqual(1000);
      expect(opts.reconnectionDelayMax).toBeLessThanOrEqual(5000);
    });
  });

  describe('subscribe / unsubscribe', () => {
    it('should emit "subscribe" with the executionId after connect', () => {
      const socket = createExecutionSocket();
      socket.connect('jwt');
      socket.subscribe('exec-1');
      expect(mockSocket.emit).toHaveBeenCalledWith('subscribe', { executionId: 'exec-1' });
    });

    it('should emit "unsubscribe" with the executionId', () => {
      const socket = createExecutionSocket();
      socket.connect('jwt');
      socket.unsubscribe('exec-1');
      expect(mockSocket.emit).toHaveBeenCalledWith('unsubscribe', { executionId: 'exec-1' });
    });

    it('should silently no-op when subscribe is called before connect', () => {
      const socket = createExecutionSocket();
      expect(() => socket.subscribe('exec-1')).not.toThrow();
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe('event forwarding', () => {
    const envelope: ExecutionEventEnvelope = {
      type: 'step.started',
      executionId: 'exec-1',
      nodeId: 'node-1',
      nodeType: 'http-request',
      status: 'RUNNING',
      startedAt: '2026-05-06T10:00:00.000Z',
      finishedAt: null,
      durationMs: null,
      input: null,
      output: null,
      error: null,
    };

    it('should forward "event" envelopes to registered onEvent listeners', () => {
      const socket = createExecutionSocket();
      const listener = vi.fn();
      socket.connect('jwt');
      socket.onEvent(listener);

      triggerSocketEvent('event', envelope);

      expect(listener).toHaveBeenCalledWith(envelope);
    });

    it('should forward "error" payloads to registered onError listeners', () => {
      const socket = createExecutionSocket();
      const listener = vi.fn();
      socket.connect('jwt');
      socket.onError(listener);

      triggerSocketEvent('error', { message: 'Forbidden' });

      expect(listener).toHaveBeenCalledWith({ message: 'Forbidden' });
    });

    it('should allow event listeners to be unregistered', () => {
      const socket = createExecutionSocket();
      const listener = vi.fn();
      socket.connect('jwt');
      const off = socket.onEvent(listener);
      off();

      triggerSocketEvent('event', envelope);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('reconnect', () => {
    it('should re-emit "subscribe" with the last known executionId after a reconnect', () => {
      const socket = createExecutionSocket();
      socket.connect('jwt');
      socket.subscribe('exec-1');
      mockSocket.emit.mockClear();

      triggerManagerEvent('reconnect');

      expect(mockSocket.emit).toHaveBeenCalledWith('subscribe', { executionId: 'exec-1' });
    });

    it('should not re-subscribe after unsubscribe followed by reconnect', () => {
      const socket = createExecutionSocket();
      socket.connect('jwt');
      socket.subscribe('exec-1');
      socket.unsubscribe('exec-1');
      mockSocket.emit.mockClear();

      triggerManagerEvent('reconnect');

      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('should call socket.disconnect and forget the active executionId', () => {
      const socket = createExecutionSocket();
      socket.connect('jwt');
      socket.subscribe('exec-1');

      socket.disconnect();

      expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);
    });

    it('should allow re-connecting after disconnect', () => {
      const socket = createExecutionSocket();
      socket.connect('jwt-1');
      socket.disconnect();
      socket.connect('jwt-2');

      expect(io).toHaveBeenCalledTimes(2);
    });
  });
});
