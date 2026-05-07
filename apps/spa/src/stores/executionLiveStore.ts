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

export type ExecutionLiveMode = 'live' | 'replay' | null;

export type NodeRunStatus = 'idle' | 'running' | 'success' | 'failed' | 'skipped';

export interface IterationState {
  index: number;
  total: number;
  childExecutionId: string;
  status: NodeRunStatus;
  durationMs: number | null;
  error: { message: string; code: string | null } | null;
}

export interface NodeRunState {
  status: NodeRunStatus;
  nodeType: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  input: unknown;
  output: unknown;
  error: { message: string; code: string | null } | null;
  // Populated only for iterator nodes by `iteration.started` / `iteration.completed`
  // events. Indexed by iteration index for stable inspector ordering.
  iterations?: IterationState[];
}

export interface ExecutionLiveState {
  status: ExecutionLiveStatus;
  executionId: string | null;
  mode: ExecutionLiveMode;
  viewAtTime: string | null;
  nodes: Map<string, NodeRunState>;
}

export interface ExecutionLiveActions {
  setStatus: (status: ExecutionLiveStatus) => void;
  setExecutionId: (id: string | null) => void;
  setMode: (mode: ExecutionLiveMode) => void;
  setViewAtTime: (time: string | null) => void;
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
  // iteration.* events update the iterator node's iterations[] alongside its
  // overall status; they don't drive the parent step status directly.
  'iteration.started': null,
  'iteration.completed': null,
};

const EVENT_STATUS_TO_NODE_STATUS: Record<string, NodeRunStatus> = {
  RUNNING: 'running',
  SUCCESS: 'success',
  FAILED: 'failed',
  SKIPPED: 'skipped',
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
  mode: null,
  viewAtTime: null,
  nodes: new Map(),
};

export const useExecutionLiveStore = create<ExecutionLiveStore>((set) => ({
  ...initialExecutionLiveState,

  setStatus: (status) => set({ status }),

  setExecutionId: (executionId) => set({ executionId }),

  setMode: (mode) => set({ mode }),

  setViewAtTime: (viewAtTime) => set({ viewAtTime }),

  applyEvent: (envelope) =>
    set((state) => {
      if (envelope.type === 'execution.completed') {
        return {
          status: envelope.status === 'SUCCESS' ? 'success' : 'error',
        };
      }

      if (envelope.type === 'iteration.started' || envelope.type === 'iteration.completed') {
        if (
          !envelope.nodeId ||
          envelope.iterationIndex === null ||
          envelope.iterationIndex === undefined ||
          envelope.iterationTotal === null ||
          envelope.iterationTotal === undefined ||
          !envelope.childExecutionId
        ) {
          return state;
        }

        const existing = state.nodes.get(envelope.nodeId);
        const iterations = existing?.iterations ? [...existing.iterations] : [];
        const i = envelope.iterationIndex;
        const childStatus =
          envelope.type === 'iteration.completed'
            ? (EVENT_STATUS_TO_NODE_STATUS[envelope.status] ?? 'failed')
            : 'running';
        const next: IterationState = {
          index: i,
          total: envelope.iterationTotal,
          childExecutionId: envelope.childExecutionId,
          status: childStatus,
          durationMs: envelope.durationMs ?? null,
          error: envelope.error ?? null,
        };
        const slot = iterations.findIndex((it) => it.index === i);
        if (slot === -1) iterations.push(next);
        else iterations[slot] = { ...iterations[slot], ...next };
        iterations.sort((a, b) => a.index - b.index);

        const nextNode: NodeRunState = {
          status: existing?.status ?? 'running',
          nodeType: envelope.nodeType ?? existing?.nodeType ?? 'iterator',
          startedAt: existing?.startedAt ?? envelope.startedAt ?? null,
          finishedAt: existing?.finishedAt ?? null,
          durationMs: existing?.durationMs ?? null,
          input: existing?.input ?? null,
          output: existing?.output ?? null,
          error: existing?.error ?? null,
          iterations,
        };
        const nextNodes = new Map(state.nodes);
        nextNodes.set(envelope.nodeId, nextNode);
        return {
          status: state.status === 'idle' ? 'running' : state.status,
          nodes: nextNodes,
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
        ...(existing?.iterations ? { iterations: existing.iterations } : {}),
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

  reset: () =>
    set({
      status: 'idle',
      executionId: null,
      mode: null,
      viewAtTime: null,
      nodes: new Map(),
    }),
}));

/**
 * Returns the chronological min/max of the hydrated steps' timing data, both as
 * ISO strings and as epoch milliseconds. The scrubber uses milliseconds because
 * `<input type="range">` and Radix Slider work on numeric values; the store
 * keeps the cursor as ISO so it composes with `selectNodeStateAt` directly.
 *
 * Returns null when no node has a startedAt — i.e. nothing to scrub yet.
 */
export function selectScrubberBounds(
  state: ExecutionLiveState,
): { minIso: string; maxIso: string; minMs: number; maxMs: number } | null {
  let minIso: string | null = null;
  let maxIso: string | null = null;

  for (const node of state.nodes.values()) {
    if (!node.startedAt) continue;
    if (minIso === null || node.startedAt < minIso) minIso = node.startedAt;
    const candidateMax = node.finishedAt ?? node.startedAt;
    if (maxIso === null || candidateMax > maxIso) maxIso = candidateMax;
  }

  if (minIso === null || maxIso === null) return null;

  return {
    minIso,
    maxIso,
    minMs: Date.parse(minIso),
    maxMs: Date.parse(maxIso),
  };
}

/**
 * Read-boundary selector: returns the node's runtime state filtered by the
 * scrubber cursor (`viewAtTime`). Behavior:
 *
 *   - viewAtTime null → original state (no filtering)
 *   - startedAt > viewAtTime → idle-shaped state (output/error suppressed)
 *   - otherwise → original state
 *
 * The simpler "started or not" interpretation matches the issue text. A future
 * polish could interpolate `running` between startedAt and finishedAt.
 */
export function selectNodeStateAt(
  state: ExecutionLiveState,
  nodeId: string,
): NodeRunState | undefined {
  const node = state.nodes.get(nodeId);
  if (!node) return undefined;
  if (state.viewAtTime === null) return node;
  if (node.startedAt === null || node.startedAt > state.viewAtTime) {
    return {
      ...node,
      status: 'idle',
      durationMs: null,
      input: null,
      output: null,
      error: null,
    };
  }
  return node;
}
