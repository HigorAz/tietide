import type { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { StripeUsageClient } from './stripe-usage.client';
import { UsageReportProcessor } from './usage-report.processor';

const job = (): Job => ({ id: 'j1', data: {} }) as unknown as Job;

describe('UsageReportProcessor', () => {
  let prisma: {
    subscription: { findMany: jest.Mock };
    workflowExecution: { count: jest.Mock };
  };
  let usage: { isConfigured: jest.Mock; reportUsage: jest.Mock };
  let processor: UsageReportProcessor;

  beforeEach(() => {
    prisma = {
      subscription: { findMany: jest.fn() },
      workflowExecution: { count: jest.fn() },
    };
    usage = { isConfigured: jest.fn().mockReturnValue(true), reportUsage: jest.fn() };
    processor = new UsageReportProcessor(
      prisma as unknown as PrismaService,
      usage as unknown as StripeUsageClient,
    );
  });

  it('does nothing when Stripe is not configured', async () => {
    usage.isConfigured.mockReturnValue(false);

    await processor.process(job());

    expect(prisma.subscription.findMany).not.toHaveBeenCalled();
    expect(usage.reportUsage).not.toHaveBeenCalled();
  });

  it('reports the cumulative period run count per paid subscription (set + idempotency key)', async () => {
    prisma.subscription.findMany.mockResolvedValue([
      {
        organizationId: 'org-1',
        meteredSubItemId: 'si_m',
        currentPeriodStart: new Date('2026-06-01T00:00:00Z'),
      },
    ]);
    prisma.workflowExecution.count.mockResolvedValue(1234);

    await processor.process(job());

    expect(prisma.workflowExecution.count).toHaveBeenCalledWith({
      where: {
        workflow: { organizationId: 'org-1' },
        isDryRun: false,
        createdAt: { gte: new Date('2026-06-01T00:00:00Z') },
      },
    });
    expect(usage.reportUsage).toHaveBeenCalledWith(
      'si_m',
      1234,
      expect.any(Number),
      expect.stringContaining('usage-si_m-2026-06-01T00:00:00.000Z-'),
    );
  });

  it('clamps the counting window to the month containing now when currentPeriodStart is stale', async () => {
    // Stripe rolled into a new period but the sync webhook is lagging, so the
    // stored currentPeriodStart still points at the PREVIOUS period. Counting from
    // that stale start would leak prior-period runs into the new Stripe period and
    // over-bill via action:'set'.
    jest.useFakeTimers().setSystemTime(new Date('2026-07-03T06:00:00Z'));
    try {
      prisma.subscription.findMany.mockResolvedValue([
        {
          organizationId: 'org-1',
          meteredSubItemId: 'si_m',
          currentPeriodStart: new Date('2026-06-01T00:00:00Z'),
        },
      ]);
      prisma.workflowExecution.count.mockResolvedValue(42);

      await processor.process(job());

      expect(prisma.workflowExecution.count).toHaveBeenCalledWith({
        where: {
          workflow: { organizationId: 'org-1' },
          isDryRun: false,
          createdAt: { gte: new Date('2026-07-01T00:00:00Z') },
        },
      });
      expect(usage.reportUsage).toHaveBeenCalledWith(
        'si_m',
        42,
        expect.any(Number),
        expect.stringContaining('usage-si_m-2026-07-01T00:00:00.000Z-'),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps a current (non-stale) currentPeriodStart as the counting window', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T06:00:00Z'));
    try {
      prisma.subscription.findMany.mockResolvedValue([
        {
          organizationId: 'org-1',
          meteredSubItemId: 'si_m',
          // Mid-month period start (e.g. anniversary billing) — newer than the
          // start of the month, so it must NOT be clamped away.
          currentPeriodStart: new Date('2026-06-10T00:00:00Z'),
        },
      ]);
      prisma.workflowExecution.count.mockResolvedValue(7);

      await processor.process(job());

      expect(prisma.workflowExecution.count).toHaveBeenCalledWith({
        where: {
          workflow: { organizationId: 'org-1' },
          isDryRun: false,
          createdAt: { gte: new Date('2026-06-10T00:00:00Z') },
        },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('continues to the next subscription when one report fails', async () => {
    prisma.subscription.findMany.mockResolvedValue([
      { organizationId: 'org-1', meteredSubItemId: 'si_a', currentPeriodStart: null },
      { organizationId: 'org-2', meteredSubItemId: 'si_b', currentPeriodStart: null },
    ]);
    prisma.workflowExecution.count.mockResolvedValue(5);
    usage.reportUsage.mockRejectedValueOnce(new Error('stripe down'));

    await processor.process(job());

    expect(usage.reportUsage).toHaveBeenCalledTimes(2);
  });
});
