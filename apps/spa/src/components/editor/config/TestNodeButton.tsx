import { cn } from '@/utils/cn';
import { useTestNode } from './useTestNode';

interface TestNodeButtonProps {
  nodeId: string;
}

/**
 * Thin wrapper over {@link useTestNode}: the original "Test this node" button,
 * help text and inline error message. Behavior-preserving — all run/poll/capture
 * logic now lives in the hook (reused by the Phase-2 stepped TestStep).
 */
export function TestNodeButton({ nodeId }: TestNodeButtonProps) {
  const { status, result, canRun, blockedReason, run } = useTestNode(nodeId);
  const busy = status === 'running';
  const error = result.error?.message ?? null;

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        data-testid="test-node-button"
        disabled={busy || !canRun}
        title={blockedReason ?? undefined}
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
      {error && status === 'error' && (
        <p data-testid="test-node-error" role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
