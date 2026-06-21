import { useState, type JSX } from 'react';
import { Loader2 } from 'lucide-react';
import { nodeOutputSchemas } from '@tietide/shared';
import { cn } from '@/utils/cn';
import { useEditorStore } from '@/stores/editorStore';
import { useToastStore } from '@/stores/toastStore';
import { getTriggerSample } from '@/api/executions';
import { NODE_OUTPUT_EXAMPLES } from '@/components/editor/preview/nodeOutputExamples';
import { zodToExample } from '@/lib/schemaExample';
import { toWorkflowDefinition } from '../serialization';

export interface TriggerSampleControlsProps {
  nodeId: string;
  nodeType: string;
  /** Route the fetched/example sample through the overwrite-protection + diff. */
  onCapture: (candidate: unknown) => void;
  disabled?: boolean;
  blockedReason?: string | null;
}

const BUTTON_CLASS = cn(
  'w-full rounded-md border border-white/10 bg-elevated px-3 py-2 text-xs font-semibold',
  'text-text-secondary hover:text-text-primary hover:border-accent-teal',
  'disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none',
  'focus:ring-1 focus:ring-accent-teal',
);

/**
 * Step-3 controls for a TRIGGER node. A trigger has no live webhook to replay
 * while editing, so "Fetch test event" pulls the most recent genuine run's
 * payload ("use data from last run"); when none exists it falls back to a
 * built-in example and, lacking that, to a skeleton generated from the trigger's
 * concrete output schema — so downstream {{trigger.*}} pills still resolve. The
 * captured sample is routed through the shared overwrite-protection (before/after
 * diff).
 */
export function TriggerSampleControls({
  nodeId,
  nodeType,
  onCapture,
  disabled,
  blockedReason,
}: TriggerSampleControlsProps): JSX.Element {
  const workflowId = useEditorStore((s) => s.workflowId);
  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const toast = useToastStore((s) => s.show);
  const [busy, setBusy] = useState(false);

  const canRun = !!workflowId && !disabled;

  const useExample = (): boolean => {
    const example = NODE_OUTPUT_EXAMPLES[nodeType];
    if (example !== undefined) {
      onCapture(example);
      toast({ tone: 'info', message: 'No past run found — captured a built-in example.' });
      return true;
    }
    // No curated example: derive a skeleton from the trigger's concrete output
    // schema (the same field-bearing schema the data-pill picker walks) so its
    // `{{trigger.*}}` fields still resolve. `nodeOutputSchemas` holds only concrete
    // schemas — types that fall back to the generic record schema are absent here,
    // so we never fabricate fields for a raw/opaque-payload trigger.
    const schema = nodeOutputSchemas[nodeType];
    if (schema) {
      onCapture(zodToExample(schema));
      toast({
        tone: 'info',
        message: "Using a generated example from this trigger's output shape.",
      });
      return true;
    }
    return false;
  };

  const fetchSample = async (): Promise<void> => {
    if (!workflowId || busy) return;
    setBusy(true);
    try {
      const definition = toWorkflowDefinition(nodes, edges);
      const res = await getTriggerSample(workflowId, nodeId, definition);
      if (res.source === 'last-run' && res.sample) {
        onCapture(res.sample);
        toast({ tone: 'success', message: 'Captured trigger data from the last run.' });
      } else if (!useExample()) {
        toast({
          tone: 'info',
          message:
            'No sample yet — trigger this workflow once (or send a real event) so its data is captured here.',
        });
      }
    } catch {
      toast({ tone: 'error', message: 'Could not fetch a trigger sample. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        data-testid="trigger-fetch-sample"
        disabled={busy || !canRun}
        title={blockedReason ?? undefined}
        onClick={() => void fetchSample()}
        className={BUTTON_CLASS}
      >
        {busy ? (
          <span className="flex items-center justify-center gap-1.5">
            <Loader2 size={14} className="animate-spin" />
            Fetching…
          </span>
        ) : (
          'Fetch test event'
        )}
      </button>
      <p className="text-xs text-text-muted">
        Pulls the most recent run’s trigger payload (or a built-in example) so you can map data
        pills without waiting for a live event.
      </p>
    </div>
  );
}
