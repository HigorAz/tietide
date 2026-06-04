import { useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { PILL_SAMPLE_KEY } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { useExecutionLiveStore } from '@/stores/executionLiveStore';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { getUpstreamSchemas, type PathSuggestion } from '@/lib/upstream-schema';
import { groupSuggestions } from '@/lib/group-suggestions';
import { buildPillToken } from '@/lib/dataPillToken';
import { humanizePath } from '@/lib/humanize-path';
import { getNodeIcon } from '@/components/editor/nodes/nodeIcons';
import { cn } from '@/utils/cn';
import { BottomSheet } from '../BottomSheet';

/**
 * Click-to-insert data-pill panel. Shown beside the config form whenever a
 * DataPillInput is focused (`editorStore.activePillField`). Groups every
 * upstream node's output paths into collapsible, icon-labelled sections with
 * human-friendly field names and inserts the chosen alias token into the focused
 * field via the inserter that field registered on focus.
 *
 * Rows and headers use `onMouseDown` + preventDefault so the focused input never
 * blurs — if it did, `activePillField` would clear and the panel would vanish
 * before the click resolved.
 */
export function DataPillPicker(): JSX.Element | null {
  const activePillField = useEditorStore((s) => s.activePillField);
  const setActivePillField = useEditorStore((s) => s.setActivePillField);
  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const liveNodes = useExecutionLiveStore((s) => s.nodes);
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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

  const groups = useMemo(() => groupSuggestions(suggestions), [suggestions]);

  if (!activePillField) return null;

  const insert = activePillField.insert;
  const pick = (e: ReactMouseEvent<HTMLButtonElement>, suggestion: PathSuggestion): void => {
    // Keep the focused input from blurring so activePillField survives the click.
    e.preventDefault();
    insert(buildPillToken(suggestion.ref, suggestion.path));
  };
  const toggle = (e: ReactMouseEvent<HTMLButtonElement>, nodeId: string): void => {
    e.preventDefault();
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const list = (
    <div role="listbox" aria-label="Upstream data pills" className="min-h-0 flex-1 overflow-y-auto">
      {groups.length === 0 ? (
        <p className="px-3 py-2 text-xs text-text-muted">No upstream outputs to reference yet.</p>
      ) : (
        groups.map((group) => {
          const Icon = getNodeIcon(group.nodeType);
          const isOpen = !collapsed.has(group.nodeId);
          return (
            <section key={group.nodeId} className="border-b border-white/5 last:border-b-0">
              <button
                type="button"
                data-testid="data-pill-group-header"
                onMouseDown={(e) => toggle(e, group.nodeId)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-text-secondary hover:bg-white/5 focus:bg-white/5 focus:outline-none"
              >
                {isOpen ? (
                  <ChevronDown size={14} aria-hidden />
                ) : (
                  <ChevronRight size={14} aria-hidden />
                )}
                <Icon size={14} className="shrink-0 text-accent-teal" aria-hidden />
                <span className="truncate">{group.nodeLabel}</span>
                <span className="ml-auto shrink-0 text-text-muted">{group.suggestions.length}</span>
              </button>
              {isOpen && (
                <ul className="pb-1">
                  {group.suggestions.map((s, i) => (
                    <li key={`${s.ref}-${s.path}-${i}`} role="option" aria-selected={false}>
                      <button
                        type="button"
                        data-testid="data-pill-picker-option"
                        onMouseDown={(e) => pick(e, s)}
                        title={buildPillToken(s.ref, s.path)}
                        className="flex w-full items-center justify-between gap-2 py-1.5 pl-9 pr-3 text-left text-xs hover:bg-white/5 focus:bg-white/5 focus:outline-none"
                      >
                        <span className="truncate text-text-primary">{humanizePath(s.path)}</span>
                        <span className="ml-2 shrink-0 text-text-muted">{s.type}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}
    </div>
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
