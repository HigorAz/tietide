import { useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { useExecutionLiveStore } from '@/stores/executionLiveStore';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { getUpstreamSchemas, type PathSuggestion } from '@/lib/upstream-schema';
import { buildPillToken } from '@/lib/dataPillToken';
import { cn } from '@/utils/cn';
import { BottomSheet } from '../BottomSheet';

/**
 * Click-to-insert data-pill panel. Shown beside the config form whenever a
 * DataPillInput is focused (`editorStore.activePillField`). Lists every upstream
 * node's output paths as clickable pills and inserts the chosen token into the
 * focused field via the inserter that field registered on focus.
 *
 * Rows use `onMouseDown` + preventDefault so the focused input never blurs — if
 * it did, `activePillField` would clear and the panel would vanish before the
 * click resolved. There is intentionally no filter box for the same reason
 * (a focusable input would steal focus); the inline `{{` dropdown covers
 * type-to-filter.
 */
export function DataPillPicker(): JSX.Element | null {
  const activePillField = useEditorStore((s) => s.activePillField);
  const setActivePillField = useEditorStore((s) => s.setActivePillField);
  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const liveNodes = useExecutionLiveStore((s) => s.nodes);
  const isMobile = useIsMobile();

  const suggestions = useMemo<PathSuggestion[]>(() => {
    if (!activePillField) return [];
    return getUpstreamSchemas(activePillField.nodeId, nodes, edges, { liveNodes }).suggestions;
  }, [activePillField, nodes, edges, liveNodes]);

  if (!activePillField) return null;

  const insert = activePillField.insert;
  const pick = (e: ReactMouseEvent<HTMLButtonElement>, suggestion: PathSuggestion): void => {
    // Keep the focused input from blurring so activePillField survives the click.
    e.preventDefault();
    insert(buildPillToken(suggestion.nodeId, suggestion.path));
  };

  const list = (
    <ul
      role="listbox"
      aria-label="Upstream data pills"
      className="min-h-0 flex-1 overflow-y-auto py-1"
    >
      {suggestions.length === 0 ? (
        <li className="px-3 py-2 text-xs text-text-muted">No upstream outputs to reference yet.</li>
      ) : (
        suggestions.slice(0, 100).map((s, i) => {
          const token = buildPillToken(s.nodeId, s.path);
          return (
            <li key={`${s.nodeId}-${s.path}-${i}`} role="option" aria-selected={false}>
              <button
                type="button"
                data-testid="data-pill-picker-option"
                onMouseDown={(e) => pick(e, s)}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-white/5 focus:bg-white/5 focus:outline-none"
              >
                <span className="truncate font-mono text-accent-teal">{token}</span>
                <span className="ml-2 shrink-0 text-text-muted">
                  {s.nodeLabel} · {s.type}
                </span>
              </button>
            </li>
          );
        })
      )}
    </ul>
  );

  if (isMobile) {
    return (
      <BottomSheet
        open
        title="Insert data pill"
        onClose={() => setActivePillField(null)}
        data-testid="data-pill-picker-sheet"
      >
        {list}
      </BottomSheet>
    );
  }

  return (
    <div
      data-testid="data-pill-picker"
      // Stop React Flow (underneath) from starting a pan/zoom when the user
      // interacts with the panel — mirrors InspectorDock.
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      className={cn(
        'absolute bottom-4 right-4 z-10 flex h-72 w-80 flex-col overflow-hidden',
        'rounded-md border border-white/5 bg-elevated shadow-lg',
      )}
    >
      <div className="border-b border-white/5 px-3 py-2 text-xs font-semibold text-text-secondary">
        Insert data pill
      </div>
      {list}
    </div>
  );
}
