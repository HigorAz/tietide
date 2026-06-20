import { useEffect, useMemo, useRef, useState } from 'react';
import { PILL_SAMPLE_KEY } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { useExecutionLiveStore } from '@/stores/executionLiveStore';
import { useToastStore } from '@/stores/toastStore';
import { getExecution, listExecutionSteps, testNode } from '@/api/executions';
import { invalidTokensForNode } from '@/lib/validate-references';
import { toWorkflowDefinition } from '../serialization';

const TERMINAL = new Set(['SUCCESS', 'FAILED', 'CANCELLED']);
const POLL_INTERVAL_MS = 700;
const MAX_POLLS = 40;
// Captured samples persist inside the workflow definition JSONB, so cap them.
export const MAX_SAMPLE_BYTES = 32_000;

const GENERIC_FAILURE = 'Node test did not succeed. Check the run for details.';
const TIMEOUT_FAILURE = 'Test timed out — the node is still running. Check the run for the result.';
const BLOCKED_REASON = 'Fix the red data pills on this node first.';

export type TestNodeStatus = 'idle' | 'running' | 'success' | 'error';

export interface TestNodeResult {
  output: unknown | null;
  /** Measured client-side around `run()`. */
  durationMs: number | null;
  /** Shape matches the Phase-1 ErrorCard `error` prop — passed straight through. */
  error: { message: string; code: string | null } | null;
}

const EMPTY_RESULT: TestNodeResult = { output: null, durationMs: null, error: null };

/** A captured sample that differs from the node's existing one, awaiting the
 *  user's keep/replace decision (rendered by SampleDiffModal). */
export interface PendingSample {
  previous: unknown;
  next: unknown;
}

export interface UseTestNodeResult {
  status: TestNodeStatus;
  result: TestNodeResult;
  /** workflowId present && no invalid pill tokens on this node. */
  canRun: boolean;
  /** Set when invalid pill tokens block the run, else null. */
  blockedReason: string | null;
  run: () => Promise<void>;
  reset: () => void;
  /** Non-null while a captured sample is awaiting a keep/replace decision. */
  pendingSample: PendingSample | null;
  /** Adopt the pending sample, overwriting the node's existing one. */
  confirmSampleReplace: () => void;
  /** Keep the existing sample, discarding the captured one. */
  discardSampleChange: () => void;
  /** Route an externally-fetched sample (e.g. a trigger's "fetch test event")
   *  through the same overwrite-protection + diff flow as a node test. */
  captureExternalSample: (candidate: unknown) => void;
}

/** Structural equality good enough to detect "did the sample change" between two
 *  API-shaped JSON objects (stable key order). */
function sameSample(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Runs a single node against real connector credentials and captures its output
 * into the reserved `__pillSample` config key (#259), so the node's fields
 * become data pills for downstream nodes. Available on every node type — the
 * run is NOT a dry run, so side-effecting connectors fire for real.
 *
 * Extracted from TestNodeButton (behavior-preserving): same polling, guards,
 * PILL_SAMPLE_KEY write and success toast — plus a measured `durationMs`, the
 * captured output, and a structured error result for the Phase-2 inline UI.
 */
export function useTestNode(nodeId: string): UseTestNodeResult {
  const workflowId = useEditorStore((s) => s.workflowId);
  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const toast = useToastStore((s) => s.show);

  const [status, setStatus] = useState<TestNodeStatus>('idle');
  const [result, setResult] = useState<TestNodeResult>(EMPTY_RESULT);
  // Set when a captured sample differs from the node's existing one — the panel
  // shows a before/after diff so the user keeps or replaces it (never silently
  // overwriting configured pills). Carries the target node id so a confirm lands
  // on the captured node, not whatever is selected when the user clicks.
  const [pendingSample, setPendingSample] = useState<{
    nodeId: string;
    previous: unknown;
    next: unknown;
  } | null>(null);

  // Per-run token: bumped on every run start AND on every `nodeId` change, so an
  // in-flight poll loop targeting the previous node can detect it is stale and
  // bail out of any setState / pill-sample write after the panel moved on.
  const runIdRef = useRef(0);
  // False once the hook unmounts (panel closed / node deselected) — stops any
  // post-await setState from firing on an unmounted tree.
  const mountedRef = useRef(true);
  // Tracks the live sleep timer so unmount cancels the pending poll tick.
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Resolver for the in-flight sleep, so unmount can settle it immediately (the
  // loop then bails via the stale check) instead of leaving a dangling promise.
  const sleepResolveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (sleepTimerRef.current !== null) {
        clearTimeout(sleepTimerRef.current);
        sleepTimerRef.current = null;
      }
      // Settle any awaiter so the orphaned run() chain unwinds (it returns early
      // on the next stale check) rather than hanging forever.
      if (sleepResolveRef.current !== null) {
        const resolve = sleepResolveRef.current;
        sleepResolveRef.current = null;
        resolve();
      }
    };
  }, []);

  // Invalidate any in-flight run when the target node changes.
  useEffect(() => {
    runIdRef.current += 1;
  }, [nodeId]);

  // This node can't be tested while it references a deleted/invalid node. Live run
  // output beats a possibly-stale sample, matching the picker's resolution.
  const liveNodes = useExecutionLiveStore((s) => s.nodes);
  const hasInvalid = useMemo(
    () => invalidTokensForNode(nodeId, nodes, edges, liveNodes).size > 0,
    [nodeId, nodes, edges, liveNodes],
  );

  const canRun = !!workflowId && !hasInvalid;
  const blockedReason = hasInvalid ? BLOCKED_REASON : null;

  const fail = (message: string, code: string | null = null): void => {
    setResult({ output: null, durationMs: null, error: { message, code } });
    setStatus('error');
  };

  // Read the node's currently-stored sample fresh from the store (not a closure)
  // so an overwrite decision compares against the latest config.
  const readExistingSample = (id: string): unknown => {
    const node = useEditorStore.getState().nodes.find((n) => n.id === id);
    return node?.data.config?.[PILL_SAMPLE_KEY];
  };

  // Adopt a captured sample, but never silently clobber an existing, different
  // one: write straight through on first capture or when unchanged; otherwise
  // stage a pending diff for the user to keep or replace.
  const commitSample = (id: string, candidate: unknown): void => {
    const existing = readExistingSample(id);
    if (existing === undefined) {
      updateNodeConfig(id, { [PILL_SAMPLE_KEY]: candidate });
      toast({ tone: 'success', message: 'Output captured as a data-pill sample.' });
      return;
    }
    if (sameSample(existing, candidate)) {
      toast({ tone: 'info', message: 'Sample unchanged — existing data pills kept.' });
      return;
    }
    setPendingSample({ nodeId: id, previous: existing, next: candidate });
  };

  const confirmSampleReplace = (): void => {
    if (!pendingSample) return;
    updateNodeConfig(pendingSample.nodeId, { [PILL_SAMPLE_KEY]: pendingSample.next });
    toast({ tone: 'success', message: 'Data-pill sample updated.' });
    setPendingSample(null);
  };

  const discardSampleChange = (): void => {
    if (!pendingSample) return;
    toast({ tone: 'info', message: 'Kept the existing data-pill sample.' });
    setPendingSample(null);
  };

  const captureExternalSample = (candidate: unknown): void => {
    if (JSON.stringify(candidate).length > MAX_SAMPLE_BYTES) {
      fail('Output is too large to capture as a sample.');
      return;
    }
    setResult({ output: candidate, durationMs: null, error: null });
    setStatus('success');
    commitSample(nodeId, candidate);
  };

  const run = async (): Promise<void> => {
    if (!workflowId || status === 'running' || hasInvalid) return;
    // Claim this run; capture the node it targets so a later node switch can
    // be detected (runIdRef bumps on nodeId change) and no write lands on the
    // node the user navigated away from.
    const myRun = ++runIdRef.current;
    const capturedNodeId = nodeId;
    // True only while this run is still the active, mounted target.
    const isStale = (): boolean => runIdRef.current !== myRun || !mountedRef.current;
    // Cancellable sleep: resolves early (with a stale signal) if the hook
    // unmounts mid-tick so no setState fires on an unmounted tree.
    const sleep = (ms: number): Promise<void> =>
      new Promise((resolve) => {
        sleepResolveRef.current = resolve;
        sleepTimerRef.current = setTimeout(() => {
          sleepTimerRef.current = null;
          sleepResolveRef.current = null;
          resolve();
        }, ms);
      });

    setStatus('running');
    setResult(EMPTY_RESULT);
    const startedAt = performance.now();
    try {
      const definition = toWorkflowDefinition(nodes, edges);
      const execution = await testNode(workflowId, capturedNodeId, definition);
      if (isStale()) return;

      let execStatus = execution.status as string;
      for (let i = 0; i < MAX_POLLS && !TERMINAL.has(execStatus); i++) {
        await sleep(POLL_INTERVAL_MS);
        if (isStale()) return;
        execStatus = (await getExecution(execution.id)).status as string;
        if (isStale()) return;
      }

      if (execStatus !== 'SUCCESS') {
        // The loop exhausted MAX_POLLS while the execution was still non-terminal:
        // the node is slow/hung, not failed. Surface a distinct timeout message so
        // a slow connector is distinguishable from a real failure (IN-06).
        if (!TERMINAL.has(execStatus)) {
          fail(TIMEOUT_FAILURE, null);
          return;
        }
        // Enrich with the failing step's error text when the API exposes it.
        let message = GENERIC_FAILURE;
        try {
          const steps = await listExecutionSteps(execution.id);
          const step = steps.find((s) => s.nodeId === capturedNodeId);
          if (step?.error) message = step.error;
        } catch {
          // keep the generic message
        }
        if (isStale()) return;
        // ExecutionStep exposes no error code, so it is always null.
        fail(message, null);
        return;
      }

      const steps = await listExecutionSteps(execution.id);
      if (isStale()) return;
      const step = steps.find((s) => s.nodeId === capturedNodeId);
      if (!step || step.outputData == null) {
        fail('No output was captured for this node.');
        return;
      }

      if (JSON.stringify(step.outputData).length > MAX_SAMPLE_BYTES) {
        fail('Output is too large to capture as a sample.');
        return;
      }

      setResult({
        output: step.outputData,
        durationMs: performance.now() - startedAt,
        error: null,
      });
      setStatus('success');
      // Capture against the CAPTURED node, never the latest closure — and route
      // through the overwrite-protection so an existing sample is never silently
      // clobbered (a before/after diff prompts the user; #3).
      commitSample(capturedNodeId, step.outputData);
    } catch {
      if (isStale()) return;
      fail('Could not run this node. Please try again.');
    }
  };

  const reset = (): void => {
    setStatus('idle');
    setResult(EMPTY_RESULT);
    setPendingSample(null);
  };

  return {
    status,
    result,
    canRun,
    blockedReason,
    run,
    reset,
    pendingSample: pendingSample
      ? { previous: pendingSample.previous, next: pendingSample.next }
      : null,
    confirmSampleReplace,
    discardSampleChange,
    captureExternalSample,
  };
}
