import { useEffect, useRef, type JSX } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { JsonTree } from '@/components/editor/dataviewer/JsonTree';
import { ErrorCard } from '@/components/editor/run/ErrorCard';
import { useTestNode } from '../config/useTestNode';
import { summarizeOutput } from './summarizeOutput';

export interface TestStepProps {
  nodeId: string;
  /** ConfigSteps passes openStep('configure') — fired by the ErrorCard. */
  onFixInConfigure: () => void;
  /** Drives the `tested` state + the '✓ tested · N items' header summary. */
  onResult: (r: { ok: boolean; summary: string }) => void;
}

const BUTTON_CLASS = cn(
  'w-full rounded-md border border-white/10 bg-elevated px-3 py-2 text-xs font-semibold',
  'text-text-secondary hover:text-text-primary hover:border-accent-teal',
  'disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none',
  'focus:ring-1 focus:ring-accent-teal',
);

/**
 * Step-3 body of the stepped config panel. Wraps {@link useTestNode}: a run
 * button → spinner while running → an inline success chip + the Phase-1 tree
 * viewer of the captured output, or the Phase-1 structured ErrorCard on failure
 * (its "Fix in Configure" reopens step 2). On success it reports an
 * `{ ok, summary }` so the step header can read '✓ tested · N items'.
 */
export function TestStep({ nodeId, onFixInConfigure, onResult }: TestStepProps): JSX.Element {
  const { status, result, canRun, blockedReason, run } = useTestNode(nodeId);
  const busy = status === 'running';

  // Report success once per transition into the success state.
  const reportedRef = useRef(false);
  useEffect(() => {
    if (status === 'success') {
      if (!reportedRef.current) {
        reportedRef.current = true;
        onResult({ ok: true, summary: summarizeOutput(result.output) });
      }
    } else {
      reportedRef.current = false;
    }
  }, [status, result.output, onResult]);

  const durationLabel =
    result.durationMs !== null ? `${(result.durationMs / 1000).toFixed(2)}s` : '—';

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        data-testid="test-step-run"
        disabled={busy || !canRun}
        title={blockedReason ?? undefined}
        onClick={() => void run()}
        className={BUTTON_CLASS}
      >
        {busy ? (
          <span className="flex items-center justify-center gap-1.5">
            <Loader2 size={14} data-testid="test-step-spinner" className="animate-spin" />
            Testing…
          </span>
        ) : (
          'Test this node'
        )}
      </button>

      <p className="text-xs text-text-muted">
        Runs this node with live credentials and captures its output as a data-pill sample.
      </p>

      {status === 'success' && (
        <div className="flex flex-col gap-2">
          <span
            data-testid="test-step-success-chip"
            className="inline-flex w-fit items-center rounded-full bg-status-success/15 px-2.5 py-1 text-xs font-medium text-status-success"
          >
            {`✓ Success · ${durationLabel} · output captured — data pills from this node are now available downstream`}
          </span>
          <div className="max-h-[280px] overflow-auto rounded-md border border-white/10 bg-deep-blue/40 p-2">
            <JsonTree value={result.output} testId="test-step-output" />
          </div>
        </div>
      )}

      {status === 'error' && result.error && (
        <ErrorCard error={result.error} onFixInConfigure={onFixInConfigure} />
      )}
    </div>
  );
}
