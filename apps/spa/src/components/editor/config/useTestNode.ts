import { useMemo, useState } from 'react';
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

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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
    setStatus('running');
    setResult(EMPTY_RESULT);
    const startedAt = performance.now();
    try {
      const definition = toWorkflowDefinition(nodes, edges);
      const execution = await testNode(workflowId, nodeId, definition);

      let execStatus = execution.status as string;
      for (let i = 0; i < MAX_POLLS && !TERMINAL.has(execStatus); i++) {
        await sleep(POLL_INTERVAL_MS);
        execStatus = (await getExecution(execution.id)).status as string;
      }

      if (execStatus !== 'SUCCESS') {
        // Enrich with the failing step's error text when the API exposes it.
        let message = GENERIC_FAILURE;
        try {
          const steps = await listExecutionSteps(execution.id);
          const step = steps.find((s) => s.nodeId === nodeId);
          if (step?.error) message = step.error;
        } catch {
          // keep the generic message
        }
        // ExecutionStep exposes no error code, so it is always null.
        fail(message, null);
        return;
      }

      const steps = await listExecutionSteps(execution.id);
      const step = steps.find((s) => s.nodeId === nodeId);
      if (!step || step.outputData == null) {
        fail('No output was captured for this node.');
        return;
      }

      if (JSON.stringify(step.outputData).length > MAX_SAMPLE_BYTES) {
        fail('Output is too large to capture as a sample.');
        return;
      }

      updateNodeConfig(nodeId, { [PILL_SAMPLE_KEY]: step.outputData });
      toast({ tone: 'success', message: 'Output captured as a data-pill sample.' });
      setResult({
        output: step.outputData,
        durationMs: performance.now() - startedAt,
        error: null,
      });
      setStatus('success');
    } catch {
      fail('Could not run this node. Please try again.');
    }
  };

  const reset = (): void => {
    setStatus('idle');
    setResult(EMPTY_RESULT);
  };

  return { status, result, canRun, blockedReason, run, reset };
}
