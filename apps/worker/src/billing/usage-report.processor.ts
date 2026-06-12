import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { StripeUsageClient } from './stripe-usage.client';
import { USAGE_REPORT_QUEUE_NAME } from './usage-report.constants';

/** UTC midnight on the first of the current calendar month. */
function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Reports each paid workspace's cumulative period run count to its metered Stripe
 * subscription item. Runs daily. The included-run allowance is modelled as the $0
 * tier of a graduated price in Stripe, so we report TOTAL runs and let Stripe apply
 * the free tier. Reporting is cumulative (`action:'set'`) + idempotency-keyed, so a
 * re-fire cannot double-count.
 */
@Processor(USAGE_REPORT_QUEUE_NAME)
export class UsageReportProcessor extends WorkerHost {
  private readonly log = new Logger(UsageReportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: StripeUsageClient,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (!this.usage.isConfigured()) {
      this.log.debug({ jobId: job.id }, 'Stripe not configured; skipping usage report');
      return;
    }

    const subs = await this.prisma.subscription.findMany({
      where: { plan: { not: 'FREE' }, meteredSubItemId: { not: null } },
      select: { organizationId: true, meteredSubItemId: true, currentPeriodStart: true },
    });

    const now = new Date();
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const dayKey = now.toISOString().slice(0, 10);

    const monthStart = startOfMonthUtc(now);

    for (const sub of subs) {
      // Clamp the counting window to the period containing `now`. `currentPeriodStart`
      // is updated only by Stripe webhooks; if a webhook lags past a period boundary it
      // still points at the OLD (larger) period. Counting from a stale start and then
      // `set`ting that total into the NEW Stripe period would over-bill, so we never
      // let the window reach earlier than the month containing the report timestamp.
      const periodStart = sub.currentPeriodStart ?? monthStart;
      const since = periodStart > monthStart ? periodStart : monthStart;
      const quantity = await this.prisma.workflowExecution.count({
        where: {
          workflow: { organizationId: sub.organizationId },
          isDryRun: false,
          createdAt: { gte: since },
        },
      });
      const idempotencyKey = `usage-${sub.meteredSubItemId}-${since.toISOString()}-${dayKey}`;
      try {
        await this.usage.reportUsage(sub.meteredSubItemId!, quantity, nowSeconds, idempotencyKey);
      } catch (err) {
        this.log.error(
          { organizationId: sub.organizationId, error: (err as Error).message },
          'Failed to report metered usage; will retry next tick',
        );
      }
    }
  }
}
