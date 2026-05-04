import { create } from 'zustand';
import { getUsageSummary, type UsageRange, type UsageSummary } from '@/api/usage';

export type UsageStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UsageState {
  summary: UsageSummary | null;
  range: UsageRange;
  status: UsageStatus;
  error: string | null;
}

export interface UsageActions {
  setRange: (range: UsageRange) => void;
  fetch: (range?: UsageRange) => Promise<void>;
}

export type UsageStore = UsageState & UsageActions;

const toMessage = (err: unknown): string => {
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong';
};

export const initialUsageState: UsageState = {
  summary: null,
  range: '7d',
  status: 'idle',
  error: null,
};

export const useUsageStore = create<UsageStore>((set, get) => ({
  ...initialUsageState,

  setRange: (range) => {
    set({ range });
  },

  fetch: async (range) => {
    const target = range ?? get().range;
    set({ status: 'loading', error: null, range: target });
    try {
      const summary = await getUsageSummary(target);
      set({ summary, status: 'ready', error: null });
    } catch (err) {
      set({ status: 'error', error: toMessage(err) });
    }
  },
}));
