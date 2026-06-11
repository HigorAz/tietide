import { Injectable } from '@nestjs/common';
import { PLAN_LIMITS, type PlanLimits, type PlanTier } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentRequiredException } from './payment-required.exception';
import type { EntitlementsDto } from './dto/entitlements.dto';

/** UTC midnight on the first of the current calendar month (FREE billing period). */
function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Resolves a workspace's plan limits (from the shared PLAN_LIMITS map) against its
 * live usage, and enforces them. Prisma-only — no Stripe dependency — so it stays
 * cheap to inject anywhere a quota gate is needed.
 */
@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  limitsFor(plan: PlanTier): PlanLimits {
    return PLAN_LIMITS[plan] ?? PLAN_LIMITS.FREE;
  }

  /** Period start used for run metering: the Stripe period for paid plans, else the calendar month. */
  private periodStart(currentPeriodStart: Date | null, now: Date): Date {
    return currentPeriodStart ?? startOfMonthUtc(now);
  }

  private async planOf(orgId: string): Promise<PlanTier> {
    const sub = await this.prisma.subscription.findUnique({
      where: { organizationId: orgId },
      select: { plan: true },
    });
    return (sub?.plan ?? 'FREE') as PlanTier;
  }

  /** Active pending invites still count against seat capacity. */
  private async seatUsage(orgId: string, now: Date): Promise<{ members: number; pending: number }> {
    const [members, pending] = await Promise.all([
      this.prisma.organizationMember.count({ where: { organizationId: orgId } }),
      this.prisma.organizationInvite.count({
        where: { organizationId: orgId, consumedAt: null, expiresAt: { gt: now } },
      }),
    ]);
    return { members, pending };
  }

  private countRunsSince(orgId: string, since: Date): Promise<number> {
    return this.prisma.workflowExecution.count({
      where: { workflow: { organizationId: orgId }, isDryRun: false, createdAt: { gte: since } },
    });
  }

  async getEntitlements(orgId: string): Promise<EntitlementsDto> {
    const now = new Date();
    const sub = await this.prisma.subscription.findUnique({ where: { organizationId: orgId } });
    const plan = (sub?.plan ?? 'FREE') as PlanTier;
    const limits = this.limitsFor(plan);

    const [{ members, pending }, runsUsed, workflowsUsed] = await Promise.all([
      this.seatUsage(orgId, now),
      this.countRunsSince(orgId, this.periodStart(sub?.currentPeriodStart ?? null, now)),
      this.prisma.workflow.count({ where: { organizationId: orgId } }),
    ]);

    return {
      plan,
      status: sub?.status ?? 'ACTIVE',
      seats: { used: members + pending, included: limits.includedSeats, max: limits.maxSeats },
      runs: { used: runsUsed, included: limits.includedRunsPerPeriod, hardCap: limits.hardRunCap },
      workflows: { used: workflowsUsed, max: limits.maxWorkflows },
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    };
  }

  /**
   * A user may own at most `freeWorkspacesPerOwner` FREE workspaces. Joining other
   * people's workspaces is never capped. Pre-existing over-cap owners are
   * grandfathered — this only fires on creation.
   */
  async assertCanCreateWorkspace(userId: string): Promise<void> {
    const limit = PLAN_LIMITS.FREE.freeWorkspacesPerOwner;
    if (limit === null) return;
    const ownedFree = await this.prisma.organization.count({
      where: { createdById: userId, subscription: { plan: 'FREE' } },
    });
    if (ownedFree >= limit) {
      throw new PaymentRequiredException(
        'workspaces',
        'You have reached the free workspace limit. Upgrade an existing workspace to create more.',
      );
    }
  }

  /**
   * Seat capacity guard. `includePending` counts active invites toward the cap
   * (true when creating an invite; false at accept time, where only actual members
   * bound the seat count).
   */
  async assertCanAddSeat(orgId: string, includePending: boolean): Promise<void> {
    const plan = await this.planOf(orgId);
    const { maxSeats } = this.limitsFor(plan);
    if (maxSeats === null) return;
    const { members, pending } = await this.seatUsage(orgId, new Date());
    const used = members + (includePending ? pending : 0);
    if (used >= maxSeats) {
      throw new PaymentRequiredException(
        'seats',
        'This workspace has no seats left. Upgrade the plan to add more members.',
      );
    }
  }

  /**
   * Workflow-count guard. FREE caps the number of workflows a workspace may hold
   * (`maxWorkflows`); paid plans are unlimited (`null`) and never block. Mirrors
   * `assertCanAddSeat`: resolve the plan, short-circuit when unlimited, else count
   * live workflows and throw 402 at the cap.
   */
  async assertCanCreateWorkflow(orgId: string): Promise<void> {
    const plan = await this.planOf(orgId);
    const { maxWorkflows } = this.limitsFor(plan);
    if (maxWorkflows === null) return;
    const used = await this.prisma.workflow.count({ where: { organizationId: orgId } });
    if (used >= maxWorkflows) {
      throw new PaymentRequiredException(
        'workflows',
        'This workspace has reached its workflow limit. Upgrade the plan to create more.',
      );
    }
  }

  /** Hard run cap on FREE only; paid plans meter overage and never block. */
  async assertCanRun(orgId: string): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({
      where: { organizationId: orgId },
      select: { plan: true, currentPeriodStart: true },
    });
    const plan = (sub?.plan ?? 'FREE') as PlanTier;
    const { hardRunCap } = this.limitsFor(plan);
    if (hardRunCap === null) return;
    const used = await this.countRunsSince(
      orgId,
      this.periodStart(sub?.currentPeriodStart ?? null, new Date()),
    );
    if (used >= hardRunCap) {
      throw new PaymentRequiredException(
        'runs',
        'This workspace has used its included runs for the period. Upgrade to keep running workflows.',
      );
    }
  }
}
