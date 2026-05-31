import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  RETENTION_INTERVAL_PATTERN,
  RETENTION_QUEUE,
  RETENTION_SCHEDULER_KEY,
  RETENTION_SWEEP_JOB,
} from './retention.constants';

@Injectable()
export class RetentionScheduler implements OnModuleInit {
  private readonly log = new Logger(RetentionScheduler.name);

  constructor(@InjectQueue(RETENTION_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      RETENTION_SCHEDULER_KEY,
      { pattern: RETENTION_INTERVAL_PATTERN },
      {
        name: RETENTION_SWEEP_JOB,
        opts: {
          removeOnComplete: { age: 3600, count: 100 },
          removeOnFail: { age: 24 * 3600 },
        },
      },
    );
    this.log.log(
      { pattern: RETENTION_INTERVAL_PATTERN },
      'Execution retention scheduler registered',
    );
  }
}
