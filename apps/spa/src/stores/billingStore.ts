import { create } from 'zustand';
import {
  getBilling,
  startCheckout,
  openBillingPortal,
  type BillingSummary,
  type PurchasablePlan,
} from '@/api/billing';

export type BillingStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface BillingState {
  summary: BillingSummary | null;
  status: BillingStatus;
  error: string | null;
  /** Set while a checkout/portal redirect is being prepared. */
  redirecting: boolean;
}

export interface BillingActions {
  load: () => Promise<void>;
  checkout: (plan: PurchasablePlan) => Promise<void>;
  portal: () => Promise<void>;
}

export type BillingStore = BillingState & BillingActions;

const toMessage = (err: unknown): string =>
  err instanceof Error && err.message ? err.message : 'Something went wrong';

export const initialBillingState: BillingState = {
  summary: null,
  status: 'idle',
  error: null,
  redirecting: false,
};

const redirect = (url: string): void => {
  window.location.href = url;
};

export const useBillingStore = create<BillingStore>((set) => ({
  ...initialBillingState,

  load: async () => {
    set({ status: 'loading', error: null });
    try {
      const summary = await getBilling();
      set({ summary, status: 'ready', error: null });
    } catch (err) {
      set({ status: 'error', error: toMessage(err) });
    }
  },

  checkout: async (plan) => {
    set({ redirecting: true, error: null });
    try {
      redirect(await startCheckout(plan));
    } catch (err) {
      set({ redirecting: false, error: toMessage(err) });
    }
  },

  portal: async () => {
    set({ redirecting: true, error: null });
    try {
      redirect(await openBillingPortal());
    } catch (err) {
      set({ redirecting: false, error: toMessage(err) });
    }
  },
}));
