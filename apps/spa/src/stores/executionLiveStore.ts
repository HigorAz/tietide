import { create } from 'zustand';
import type { ExecutionEventEnvelope, ExecutionEventType, ExecutionStep } from '@tietide/shared';

/**
 * Live execution state surfaced by the editor's overlay.
 *
 * `status` drives the InspectorDock's idle→running auto-switch.
 * `nodes` is the per-node truth that CustomNode and LivingInkEdge subscribe
 * to so they re-render when the WS gateway forwards a step event.
 */
export type ExecutionLiveStatus = 'idle' | 'running' | 'success' | 'error';

export type NodeRunStatus = 'idle' | 'running' | 'success' | 'failed' | 'skipped';

export interface NodeRunState {
  status: NodeRunStatus;
  nodeType: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  input: unknown;
  output: unknown;
  error: { message: string; code: string | null } | null;
}

export interface ExecutionLiveState {
  status: ExecutionLiveStatus;
  executionId: string | null;
  nodes: Map<string, NodeRunState>;
}

export interface ExecutionLiveActions {
  setStatus: (status: ExecutionLiveStatus) => void;
  setExecutionId: (id: string | null) => void;
  applyEvent: (envelope: ExecutionEventEnvelope) => void;
  seedFromSteps: (steps: ExecutionStep[]) => void;
  reset: () => void;
}

export type ExecutionLiveStore = ExecutionLiveState & ExecutionLiveActions;

const EVENT_TO_NODE_STATUS: Record<ExecutionEventType, NodeRunStatus | null> = {
  'step.started': 'running',
  'step.completed': 'success',
  'step.failed': 'failed',
  'step.skipped': 'skipped',
  'execution.completed': null,
};

const STEP_STATUS_TO_NODE_STATUS: Record<string, NodeRunStatus> = {
  PENDING: 'idle',
  RUNNING: 'running',
  SUCCESS: 'success',
  FAILED: 'failed',
  CANCELLED: 'failed',
  SKIPPED: 'skipped',
};

const toIso = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
};

export const initialExecutionLiveState: ExecutionLiveState = {
  status: 'idle',
  executionId: null,
  nodes: new Map(),
};

export const useExecutionLiveStore = create<ExecutionLiveStore>((set) => ({
  ...initialExecutionLiveState,

  setStatus: (status) => set({ status }),

  setExecutionId: (executionId) => set({ executionId }),

  applyEvent: (envelope) =>
    set((state) => {
      if (envelope.type === 'execution.completed') {
        return {
          status: envelope.status === 'SUCCESS' ? 'success' : 'error',
        };
      }

      const nodeStatus = EVENT_TO_NODE_STATUS[envelope.type];
      if (!nodeStatus || !envelope.nodeId) return state;

      const existing = state.nodes.get(envelope.nodeId);
      const nextNode: NodeRunState = {
        status: nodeStatus,
        nodeType: envelope.nodeType ?? existing?.nodeType ?? null,
        startedAt: envelope.startedAt ?? existing?.startedAt ?? null,
        finishedAt: envelope.finishedAt ?? existing?.finishedAt ?? null,
        durationMs: envelope.durationMs ?? existing?.durationMs ?? null,
        input: envelope.input !== null ? envelope.input : (existing?.input ?? null),
        output: envelope.output !== null ? envelope.output : (existing?.output ?? null),
        error: envelope.error ?? existing?.error ?? null,
      };

      const nextNodes = new Map(state.nodes);
      nextNodes.set(envelope.nodeId, nextNode);

      return {
        status: state.status === 'idle' ? 'running' : state.status,
        nodes: nextNodes,
      };
    }),

  seedFromSteps: (steps) =>
    set((state) => {
      const nextNodes = new Map(state.nodes);
      let anyRunning = false;

      for (const step of steps) {
        const status = STEP_STATUS_TO_NODE_STATUS[step.status as string] ?? 'idle';
        if (status === 'running') anyRunning = true;
        nextNodes.set(step.nodeId, {
          status,
          nodeType: step.nodeType,
          startedAt: toIso(step.startedAt),
          finishedAt: toIso(step.finishedAt),
          durationMs: step.durationMs ?? null,
          input: step.inputData ?? null,
          output: step.outputData ?? null,
          error: step.error ? { message: step.error, code: null } : null,
        });
      }

      return {
        nodes: nextNodes,
        status: anyRunning && state.status === 'idle' ? 'running' : state.status,
      };
    }),

  reset: () => set({ status: 'idle', executionId: null, nodes: new Map() }),
}));
