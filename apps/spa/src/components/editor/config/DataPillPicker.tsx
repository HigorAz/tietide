import { useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import { PILL_SAMPLE_KEY } from '@tietide/shared';
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

  // A user-declared (or test-captured) `__pillSample` is the top-priority pill
  // source (#259) — it overrides the node's static schema. Keyed by nodeId for
  // `getUpstreamSchemas`. Stored as a JSON string by the form; tolerate an
  // already-structured value too. Invalid/empty samples are ignored.
  const overrides = useMemo<Record<string, unknown>>(() => {
    const map: Record<string, unknown> = {};
    for (const n of nodes) {
      const parsed = parsePillSample(n.data.config?.[PILL_SAMPLE_KEY]);
      if (parsed !== undefined) map[n.id] = parsed;
    }
    return map;
  }, [nodes]);

  const suggestions = useMemo<PathSuggestion[]>(() => {
    if (!activePillField) return [];
    return getUpstreamSchemas(activePillField.nodeId, nodes, edges, { liveNodes, overrides })
      .suggestions;
  }, [activePillField, nodes, edges, liveNodes, overrides]);

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

/**
 * Coerce a stored `__pillSample` config value into a structured override for the
 * picker. Strings are parsed as JSON; already-structured objects/arrays pass
 * through. Empty strings, invalid JSON, and bare primitives yield `undefined`
 * so the picker falls back to the node's schema.
 */
function parsePillSample(raw: unknown): unknown {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    try {
      return JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }
  if (typeof raw === 'object') return raw;
  return undefined;
}
