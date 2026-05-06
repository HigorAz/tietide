import { Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { ExecutionEventsService } from './execution-events.service';
import { EXECUTION_EVENTS_PUBLISHER } from './execution-events.constants';
import { redisPublisherProvider } from './redis-publisher.provider';

@Module({
  imports: [ConfigModule],
  providers: [redisPublisherProvider, ExecutionEventsService],
  exports: [ExecutionEventsService],
})
export class ExecutionEventsModule implements OnModuleDestroy {
  constructor(@Inject(EXECUTION_EVENTS_PUBLISHER) private readonly publisher: Redis) {}

  async onModuleDestroy(): Promise<void> {
    if (this.publisher.status === 'end') {
      return;
    }
    await this.publisher.quit().catch(() => undefined);
  }
}
