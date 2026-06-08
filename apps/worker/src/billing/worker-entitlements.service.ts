import { Injectable } from '@nestjs/common';
import { PLAN_LIMITS, type PlanTier } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';

/** UTC midnight on the first of the current calendar month (FREE billing period). */
function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Worker-side run-quota check for trigger-driven executions (cron, poll). Mirrors
 * the API's EntitlementsService.assertCanRun but returns a boolean — over-quota
 * ticks SKIP rather than throw, since a throw would only schedule a pointless
 * BullMQ retry. Reads the shared PLAN_LIMITS so both apps agree on the cap.
 */
@Injectable()
export class WorkerEntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  /** False when a FREE workspace has spent its included runs; paid plans always true. */
  async canRun(organizationId: string): Promise<boolean> {
    const sub = await this.prisma.subscription.findUnique({
      where: { organizationId },
      select: { plan: true, currentPeriodStart: true },
    });
    const plan = (sub?.plan ?? 'FREE') as PlanTier;
    const { hardRunCap } = PLAN_LIMITS[plan] ?? PLAN_LIMITS.FREE;
    if (hardRunCap === null) return true;
    const since = sub?.currentPeriodStart ?? startOfMonthUtc(new Date());
    const used = await this.prisma.workflowExecution.count({
      where: { workflow: { organizationId }, isDryRun: false, createdAt: { gte: since } },
    });
    return used < hardRunCap;
  }
}
