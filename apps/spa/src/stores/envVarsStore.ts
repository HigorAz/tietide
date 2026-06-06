import { create } from 'zustand';
import { listUserEnvVars, listAdminEnvVars } from '@/api/envVars';

export type EnvVarsStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface EnvVarsState {
  /** Deduped, A→Z-sorted variable keys available for data-pill insertion. */
  keys: string[];
  status: EnvVarsStatus;
  error: string | null;
}

export interface EnvVarsActions {
  /**
   * Load USER + GLOBAL variable keys. Idempotent: skips the network when keys
   * are already loaded unless `force` is set. The admin (GLOBAL) endpoint 403s
   * for non-admins — that is swallowed so a regular user still sees their own.
   */
  load: (force?: boolean) => Promise<void>;
  reset: () => void;
}

export type EnvVarsStore = EnvVarsState & EnvVarsActions;

const toMessage = (err: unknown): string => {
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong';
};

export const useEnvVarsStore = create<EnvVarsStore>((set, get) => ({
  keys: [],
  status: 'idle',
  error: null,

  load: async (force = false) => {
    const { status } = get();
    if (!force && (status === 'loading' || status === 'ready')) return;
    set({ status: 'loading', error: null });
    try {
      // USER scope is required; GLOBAL is best-effort (admin-only endpoint).
      const userVars = await listUserEnvVars();
      let globalVars: { key: string }[] = [];
      try {
        globalVars = await listAdminEnvVars();
      } catch {
        globalVars = [];
      }
      // USER keys win over GLOBAL on collision (Set dedupes; USER added first).
      const keys = Array.from(
        new Set([...userVars.map((v) => v.key), ...globalVars.map((v) => v.key)]),
      ).sort((a, b) => a.localeCompare(b));
      set({ keys, status: 'ready', error: null });
    } catch (err) {
      set({ status: 'error', error: toMessage(err) });
    }
  },

  reset: () => set({ keys: [], status: 'idle', error: null }),
}));
