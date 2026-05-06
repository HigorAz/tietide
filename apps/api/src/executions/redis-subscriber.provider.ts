import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';

export const EXECUTION_EVENTS_SUBSCRIBER_CLIENT = Symbol('EXECUTION_EVENTS_SUBSCRIBER_CLIENT');

// Minimal pub/sub surface we depend on. ioredis satisfies it; a test double
// can implement just these methods.
export interface RedisSubscriberClient {
  subscribe(...channels: string[]): Promise<number>;
  unsubscribe(...channels: string[]): Promise<number>;
  on(event: 'message', handler: (channel: string, message: string) => void): unknown;
  on(event: 'error', handler: (err: Error) => void): unknown;
  quit(): Promise<'OK'>;
}

export const redisSubscriberClientProvider: FactoryProvider<RedisSubscriberClient> = {
  provide: EXECUTION_EVENTS_SUBSCRIBER_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): RedisSubscriberClient => {
    const client = new IORedis({
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6379),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      // Required for blocking pub/sub clients per BullMQ/ioredis guidance.
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    // ioredis exposes broader overloads (callbacks, Buffer channels) than the
    // pub/sub subset we depend on — narrow at the boundary.
    return client as unknown as RedisSubscriberClient;
  },
};
