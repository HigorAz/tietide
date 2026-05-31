import { useState } from 'react';
import { PILL_SAMPLE_KEY } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { useToastStore } from '@/stores/toastStore';
import { cn } from '@/utils/cn';
import { getExecution, listExecutionSteps, testNode } from '@/api/executions';
import { toWorkflowDefinition } from '../serialization';

interface TestNodeButtonProps {
  nodeId: string;
}

const TERMINAL = new Set(['SUCCESS', 'FAILED', 'CANCELLED']);
const POLL_INTERVAL_MS = 700;
const MAX_POLLS = 40;
// Captured samples persist inside the workflow definition JSONB, so cap them.
const MAX_SAMPLE_BYTES = 32_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs a single node against real connector credentials and captures its output
 * into the reserved `__pillSample` config key (#259), so the node's fields
 * become data pills for downstream nodes. Available on every node type — the
 * run is NOT a dry run, so side-effecting connectors fire for real.
 */
export function TestNodeButton({ nodeId }: TestNodeButtonProps) {
  const workflowId = useEditorStore((s) => s.workflowId);
  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const toast = useToastStore((s) => s.show);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (): Promise<void> => {
    if (!workflowId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const definition = toWorkflowDefinition(nodes, edges);
      const execution = await testNode(workflowId, nodeId, definition);

      let status = execution.status as string;
      for (let i = 0; i < MAX_POLLS && !TERMINAL.has(status); i++) {
        await sleep(POLL_INTERVAL_MS);
        status = (await getExecution(execution.id)).status as string;
      }

      if (status !== 'SUCCESS') {
        setError('Node test did not succeed. Check the run for details.');
        return;
      }

      const steps = await listExecutionSteps(execution.id);
      const step = steps.find((s) => s.nodeId === nodeId);
      if (!step || step.outputData == null) {
        setError('No output was captured for this node.');
        return;
      }

      if (JSON.stringify(step.outputData).length > MAX_SAMPLE_BYTES) {
        setError('Output is too large to capture as a sample.');
        return;
      }

      updateNodeConfig(nodeId, { [PILL_SAMPLE_KEY]: step.outputData });
      toast({ tone: 'success', message: 'Output captured as a data-pill sample.' });
    } catch {
      setError('Could not run this node. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        data-testid="test-node-button"
        disabled={busy || !workflowId}
        onClick={() => void run()}
        className={cn(
          'w-full rounded-md border border-white/10 bg-elevated px-3 py-2 text-xs font-semibold',
          'text-text-secondary hover:text-text-primary hover:border-accent-teal',
          'disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none',
          'focus:ring-1 focus:ring-accent-teal',
        )}
      >
        {busy ? 'Testing…' : 'Test this node'}
      </button>
      <p className="text-xs text-text-muted">
        Runs this node with live credentials and captures its output as a data-pill sample.
      </p>
      {error && (
        <p data-testid="test-node-error" role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
