import { useEffect, useRef, type JSX } from 'react';
import { Loader2 } from 'lucide-react';
import { NODE_CATALOG, NodeCategory } from '@tietide/shared';
import { cn } from '@/utils/cn';
import { useEditorStore } from '@/stores/editorStore';
import { JsonTree } from '@/components/editor/dataviewer/JsonTree';
import { ErrorCard } from '@/components/editor/run/ErrorCard';
import { useTestNode } from '../config/useTestNode';
import { SampleDiffModal } from '../config/SampleDiffModal';
import { TriggerSampleControls } from './TriggerSampleControls';
import { summarizeOutput } from './summarizeOutput';

export interface TestStepProps {
  nodeId: string;
  /**
   * Whether the node's config is complete enough to run a live test. The step is
   * always shown (never locked), but the run button is disabled until ready.
   */
  ready: boolean;
  /** Tooltip explaining what is missing while `ready` is false (else null). */
  notReadyReason: string | null;
  /** ConfigSteps passes expandStep('configure') — fired by the ErrorCard. */
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
export function TestStep({
  nodeId,
  ready,
  notReadyReason,
  onFixInConfigure,
  onResult,
}: TestStepProps): JSX.Element {
  const {
    status,
    result,
    canRun,
    blockedReason,
    run,
    pendingSample,
    confirmSampleReplace,
    discardSampleChange,
    captureExternalSample,
  } = useTestNode(nodeId);
  const busy = status === 'running';

  // Fold the panel's config-readiness guard into useTestNode's own gating
  // (workflow loaded + no invalid data pills). An unmet config readiness wins
  // the tooltip so the user sees the most actionable next step.
  const effectiveCanRun = canRun && ready;
  const effectiveReason = !ready ? notReadyReason : blockedReason;

  // A trigger node has no live webhook to replay during editing, so it captures
  // data via "Fetch test event" (last run / built-in example) rather than the
  // action node's live "Test this node" run.
  const nodeType = useEditorStore((s) => s.nodes.find((n) => n.id === nodeId)?.data.nodeType);
  const isTrigger =
    nodeType !== undefined &&
    NODE_CATALOG.find((d) => d.type === nodeType)?.category === NodeCategory.TRIGGER;

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
      {isTrigger && nodeType ? (
        <TriggerSampleControls
          nodeId={nodeId}
          nodeType={nodeType}
          onCapture={captureExternalSample}
          disabled={!effectiveCanRun}
          blockedReason={effectiveReason}
        />
      ) : (
        <>
          <button
            type="button"
            data-testid="test-step-run"
            disabled={busy || !effectiveCanRun}
            title={effectiveReason ?? undefined}
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
        </>
      )}

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

      {pendingSample && (
        <SampleDiffModal
          previous={pendingSample.previous}
          next={pendingSample.next}
          onKeep={discardSampleChange}
          onReplace={confirmSampleReplace}
        />
      )}
    </div>
  );
}
