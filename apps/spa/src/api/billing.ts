import { api } from './client';

export type PlanTier = 'FREE' | 'PRO' | 'BUSINESS';
export type PurchasablePlan = Exclude<PlanTier, 'FREE'>;

export interface UsageMeter {
  used: number;
  /** Allowance included in the plan. */
  included: number;
  /** Hard stop (FREE runs) — null when metered/unlimited. */
  hardCap?: number | null;
}

export interface SeatMeter {
  used: number;
  included: number;
  /** null = unlimited. */
  max: number | null;
}

export interface BillingSummary {
  plan: PlanTier;
  status: string;
  seats: SeatMeter;
  runs: UsageMeter & { hardCap: number | null };
  workflows: { used: number; max: number | null };
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** False when the server has no Stripe keys — the SPA hides upgrade/manage. */
  configured: boolean;
}

export async function getBilling(): Promise<BillingSummary> {
  const { data } = await api.get<BillingSummary>('/billing');
  return data;
}

export async function startCheckout(plan: PurchasablePlan): Promise<string> {
  const { data } = await api.post<{ url: string }>('/billing/checkout', { plan });
  return data.url;
}

export async function openBillingPortal(): Promise<string> {
  const { data } = await api.post<{ url: string }>('/billing/portal', {});
  return data.url;
}
