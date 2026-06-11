import { useEffect, useMemo, useRef, useState } from 'react';
import { PILL_SAMPLE_KEY } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
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

export interface UseTestNodeResult {
  status: TestNodeStatus;
  result: TestNodeResult;
  /** workflowId present && no invalid pill tokens on this node. */
  canRun: boolean;
  /** Set when invalid pill tokens block the run, else null. */
  blockedReason: string | null;
  run: () => Promise<void>;
  reset: () => void;
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

  // This node can't be tested while it references a deleted/invalid node.
  const hasInvalid = useMemo(
    () => invalidTokensForNode(nodeId, nodes, edges).size > 0,
    [nodeId, nodes, edges],
  );

  const canRun = !!workflowId && !hasInvalid;
  const blockedReason = hasInvalid ? BLOCKED_REASON : null;

  const fail = (message: string, code: string | null = null): void => {
    setResult({ output: null, durationMs: null, error: { message, code } });
    setStatus('error');
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

      // Write the sample against the CAPTURED node, never the latest closure.
      updateNodeConfig(capturedNodeId, { [PILL_SAMPLE_KEY]: step.outputData });
      toast({ tone: 'success', message: 'Output captured as a data-pill sample.' });
      setResult({
        output: step.outputData,
        durationMs: performance.now() - startedAt,
        error: null,
      });
      setStatus('success');
    } catch {
      if (isStale()) return;
      fail('Could not run this node. Please try again.');
    }
  };

  const reset = (): void => {
    setStatus('idle');
    setResult(EMPTY_RESULT);
  };

  return { status, result, canRun, blockedReason, run, reset };
}
