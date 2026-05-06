import { ConfigService } from '@nestjs/config';
import type { FactoryProvider } from '@nestjs/common';
import IORedis, { type Redis } from 'ioredis';
import { EXECUTION_EVENTS_PUBLISHER } from './execution-events.constants';
import type { RedisPublisher } from './execution-events.service';

export const redisPublisherProvider: FactoryProvider<RedisPublisher> = {
  provide: EXECUTION_EVENTS_PUBLISHER,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Redis => {
    return new IORedis({
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6379),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      // Lazy connect avoids creating a connection during unit tests that
      // never resolve the provider; the first publish call kicks it off.
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });
  },
};
