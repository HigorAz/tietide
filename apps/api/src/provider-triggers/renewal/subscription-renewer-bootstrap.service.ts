import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  RENEWAL_INTERVAL_MS,
  RENEWAL_JOB_NAME,
  RENEWAL_QUEUE_NAME,
  RENEWAL_SCHEDULER_ID,
} from './subscription-renewer.constants';

@Injectable()
export class SubscriptionRenewerBootstrap implements OnModuleInit {
  private readonly log = new Logger(SubscriptionRenewerBootstrap.name);

  constructor(@InjectQueue(RENEWAL_QUEUE_NAME) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      RENEWAL_SCHEDULER_ID,
      { every: RENEWAL_INTERVAL_MS },
      {
        name: RENEWAL_JOB_NAME,
        data: {},
        opts: {
          removeOnComplete: { age: 3600, count: 50 },
          removeOnFail: { age: 24 * 3600, count: 100 },
          attempts: 1,
        },
      },
    );
    this.log.log(
      { schedulerId: RENEWAL_SCHEDULER_ID, intervalMs: RENEWAL_INTERVAL_MS },
      'Provider-subscription renewal scheduler registered',
    );
  }
}
