import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  OAUTH_REFRESH_QUEUE,
  OAUTH_REFRESH_SCAN_JOB,
  OAUTH_REFRESH_SCHEDULER_KEY,
  SCAN_INTERVAL_PATTERN,
} from './oauth-refresh.constants';

@Injectable()
export class OAuthRefreshScheduler implements OnModuleInit {
  private readonly log = new Logger(OAuthRefreshScheduler.name);

  constructor(@InjectQueue(OAUTH_REFRESH_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      OAUTH_REFRESH_SCHEDULER_KEY,
      { pattern: SCAN_INTERVAL_PATTERN },
      {
        name: OAUTH_REFRESH_SCAN_JOB,
        opts: {
          removeOnComplete: { age: 3600, count: 100 },
          removeOnFail: { age: 24 * 3600 },
        },
      },
    );
    this.log.log({ pattern: SCAN_INTERVAL_PATTERN }, 'OAuth refresh scheduler registered');
  }
}
