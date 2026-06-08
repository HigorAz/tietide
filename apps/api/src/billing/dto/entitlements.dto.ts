import type { PlanTier } from '@tietide/shared';
import type { SubscriptionStatus } from '@prisma/client';

/** Live plan + usage snapshot for a workspace (drives the SPA billing card). */
export interface EntitlementsDto {
  plan: PlanTier;
  status: SubscriptionStatus;
  /** `max: null` means unlimited. `used` counts members + active pending invites. */
  seats: { used: number; included: number; max: number | null };
  /** `hardCap: null` means metered/overage allowed (paid). */
  runs: { used: number; included: number; hardCap: number | null };
  workflows: { used: number; max: number | null };
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}
