import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { resolveTemplate, TemplatePathNotFoundError } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { useExecutionLiveStore } from '@/stores/executionLiveStore';
import { cn } from '@/utils/cn';
import { JsonBlock } from './JsonBlock';
import { buildPreviewScope } from './buildPreviewScope';

const DEBOUNCE_MS = 200;

type PreviewResult = { kind: 'ok'; value: unknown } | { kind: 'error'; message: string };

export interface NodePreviewPanelProps {
  nodeId: string;
}

export function NodePreviewPanel({ nodeId }: NodePreviewPanelProps): JSX.Element {
  const node = useEditorStore((s) => s.nodes.find((n) => n.id === nodeId) ?? null);
  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const liveNodes = useExecutionLiveStore((s) => s.nodes);

  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<PreviewResult | null>(null);

  const config = node?.data.config ?? {};
  const scope = useMemo(
    () => buildPreviewScope(nodeId, nodes, edges, liveNodes),
    [nodeId, nodes, edges, liveNodes],
  );

  useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(() => {
      try {
        const resolved = resolveTemplate(config, scope);
        setResult({ kind: 'ok', value: resolved });
      } catch (err) {
        if (err instanceof TemplatePathNotFoundError) {
          setResult({
            kind: 'error',
            message: `Template path not found: ${err.path}. Run the workflow once to populate live data, or check the path spelling.`,
          });
        } else {
          setResult({
            kind: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [open, config, scope]);

  return (
    <div className="border-t border-white/5 pt-3">
      <button
        type="button"
        data-testid="node-preview-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          'flex w-full items-center justify-between rounded-md border border-white/5 bg-elevated px-3 py-2',
          'text-sm text-text-primary',
          'hover:border-accent-teal/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-teal',
        )}
      >
        <span>Preview resolved input</span>
        {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {result?.kind === 'ok' && (
            <JsonBlock label="Resolved" testId="node-preview-output" value={result.value} />
          )}
          {result?.kind === 'error' && (
            <div
              data-testid="node-preview-error"
              className="rounded bg-status-failed/10 p-2 text-[11px] leading-snug text-status-failed"
            >
              {result.message}
            </div>
          )}
          <p className="text-[10px] leading-snug text-text-muted">
            Read-only preview. Templates resolve against the most recent upstream output, or a
            fallback example if no run has happened yet.
          </p>
        </div>
      )}
    </div>
  );
}
