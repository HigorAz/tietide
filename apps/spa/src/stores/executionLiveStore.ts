import { create } from 'zustand';

/**
 * Live execution status surfaced by the editor's InspectorDock.
 *
 * Minimal contract introduced by issue #105 so the dock can wire the
 * idle→running auto-switch behaviour. Issue C3 will extend this store
 * with the rest of the live-run payload (started, duration, step counts,
 * per-node log lines).
 */
export type ExecutionLiveStatus = 'idle' | 'running' | 'success' | 'error';

export interface ExecutionLiveState {
  status: ExecutionLiveStatus;
}

export interface ExecutionLiveActions {
  setStatus: (status: ExecutionLiveStatus) => void;
  reset: () => void;
}

export type ExecutionLiveStore = ExecutionLiveState & ExecutionLiveActions;

export const initialExecutionLiveState: ExecutionLiveState = {
  status: 'idle',
};

export const useExecutionLiveStore = create<ExecutionLiveStore>((set) => ({
  ...initialExecutionLiveState,
  setStatus: (status) => set({ status }),
  reset: () => set({ ...initialExecutionLiveState }),
}));
