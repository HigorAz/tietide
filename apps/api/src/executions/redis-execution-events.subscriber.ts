import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import {
  type ExecutionEventEnvelope,
  executionChannel,
  parseExecutionChannel,
} from '@tietide/shared';
import {
  EXECUTION_EVENTS_SUBSCRIBER_CLIENT,
  type RedisSubscriberClient,
} from './redis-subscriber.provider';
import {
  type ExecutionEventHandler,
  type ExecutionEventsSubscriber,
} from './execution-events.subscriber';

// Subset of ioredis we depend on. Defined as an interface so the gateway can
// use any pub/sub client (including a test fake) without dragging ioredis
// types into the test bundle.
export type { RedisSubscriberClient } from './redis-subscriber.provider';

// Bridges Redis pub/sub channels to in-process handlers. One ioredis subscriber
// connection multiplexed by channel — first handler per channel triggers
// SUBSCRIBE, last handler removed triggers UNSUBSCRIBE. Ownership/auth is
// enforced upstream at the WebSocket boundary, not here.
@Injectable()
export class RedisExecutionEventsSubscriber implements ExecutionEventsSubscriber, OnModuleDestroy {
  private readonly handlersByChannel = new Map<string, Set<ExecutionEventHandler>>();

  constructor(
    @Inject(EXECUTION_EVENTS_SUBSCRIBER_CLIENT) private readonly client: RedisSubscriberClient,
    private readonly logger: Logger,
  ) {
    this.client.on('message', (channel: string, message: string) => {
      this.dispatch(channel, message);
    });
    this.client.on('error', (err: Error) => {
      this.logger.warn({ err: err.message }, 'Redis subscriber error');
    });
  }

  async subscribe(executionId: string, handler: ExecutionEventHandler): Promise<void> {
    const channel = executionChannel(executionId);
    let set = this.handlersByChannel.get(channel);
    if (!set) {
      set = new Set();
      this.handlersByChannel.set(channel, set);
      await this.client.subscribe(channel);
    }
    set.add(handler);
  }

  async unsubscribe(executionId: string, handler: ExecutionEventHandler): Promise<void> {
    const channel = executionChannel(executionId);
    const set = this.handlersByChannel.get(channel);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) {
      this.handlersByChannel.delete(channel);
      await this.client.unsubscribe(channel);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch (err) {
      this.logger.warn({ err: (err as Error).message }, 'Failed to quit Redis subscriber');
    }
  }

  private dispatch(channel: string, message: string): void {
    const executionId = parseExecutionChannel(channel);
    if (!executionId) return;
    const handlers = this.handlersByChannel.get(channel);
    if (!handlers || handlers.size === 0) return;

    let envelope: ExecutionEventEnvelope;
    try {
      envelope = JSON.parse(message) as ExecutionEventEnvelope;
    } catch (err) {
      this.logger.warn(
        { channel, err: (err as Error).message },
        'Dropping malformed Redis execution event',
      );
      return;
    }

    for (const handler of handlers) {
      try {
        handler(envelope);
      } catch (err) {
        this.logger.warn(
          { channel, err: (err as Error).message },
          'Execution event handler threw; continuing',
        );
      }
    }
  }
}
