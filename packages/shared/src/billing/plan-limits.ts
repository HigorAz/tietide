/**
 * Per-workspace billing plans. The workspace (Organization) is the billing
 * entity; its owner pays, members consume seats. Pricing is hybrid: a per-seat
 * subscription plus metered runs above an included quota.
 *
 * This map is the single source of truth for plan limits and is imported by BOTH
 * the API (entitlement checks, billing) and the worker (cron/poll run-quota
 * checks), so it lives in @tietide/shared. Stripe price ids live in env, NOT here.
 *
 * All numbers are STARTER values and intended to be tuned before launch.
 */

export const PlanTier = {
  FREE: 'FREE',
  PRO: 'PRO',
  BUSINESS: 'BUSINESS',
} as const;

export type PlanTier = (typeof PlanTier)[keyof typeof PlanTier];

export interface PlanLimits {
  /** Max FREE-tier workspaces a single user may OWN. `null` = unlimited (paid). */
  freeWorkspacesPerOwner: number | null;
  /** Seats included in the base price. */
  includedSeats: number;
  /** Hard ceiling on seats. `null` = unlimited. */
  maxSeats: number | null;
  /** Runs included per billing period (the metered free allowance). */
  includedRunsPerPeriod: number;
  /**
   * Hard stop on runs once the included allowance is spent. Set only on FREE
   * (the run blocks). `null` = metered/overage allowed (paid plans never block).
   */
  hardRunCap: number | null;
  /** Max active workflows. `null` = unlimited. */
  maxWorkflows: number | null;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  // TUNABLE — free allowance generous enough to evaluate, capped to deter farming.
  FREE: {
    freeWorkspacesPerOwner: 1,
    includedSeats: 2,
    maxSeats: 2,
    includedRunsPerPeriod: 1000,
    hardRunCap: 1000,
    maxWorkflows: 10,
  },
  // TUNABLE
  PRO: {
    freeWorkspacesPerOwner: null,
    includedSeats: 5,
    maxSeats: 25,
    includedRunsPerPeriod: 50_000,
    hardRunCap: null,
    maxWorkflows: null,
  },
  // TUNABLE
  BUSINESS: {
    freeWorkspacesPerOwner: null,
    includedSeats: 20,
    maxSeats: null,
    includedRunsPerPeriod: 500_000,
    hardRunCap: null,
    maxWorkflows: null,
  },
};

/** Plans that carry a Stripe subscription (everything except FREE). */
export const PAID_PLANS: readonly PlanTier[] = [PlanTier.PRO, PlanTier.BUSINESS];

export const isPaidPlan = (plan: PlanTier): boolean => plan !== PlanTier.FREE;
