import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  USAGE_REPORT_CRON,
  USAGE_REPORT_JOB_NAME,
  USAGE_REPORT_QUEUE_NAME,
  USAGE_REPORT_SCHEDULER_ID,
} from './usage-report.constants';

/** Schedules the daily metered-usage report (idempotent upsert — safe on restart, Hurdle 25). */
@Injectable()
export class UsageReportBootstrap implements OnModuleInit {
  private readonly log = new Logger(UsageReportBootstrap.name);

  constructor(@InjectQueue(USAGE_REPORT_QUEUE_NAME) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      USAGE_REPORT_SCHEDULER_ID,
      { pattern: USAGE_REPORT_CRON },
      {
        name: USAGE_REPORT_JOB_NAME,
        data: {},
        opts: { removeOnComplete: { count: 50 }, removeOnFail: { count: 50 } },
      },
    );
    this.log.log({ cron: USAGE_REPORT_CRON }, 'Scheduled daily Stripe usage report');
  }
}
