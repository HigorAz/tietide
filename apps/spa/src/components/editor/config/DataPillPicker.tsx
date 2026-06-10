import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { ChevronDown, ChevronRight, KeyRound } from 'lucide-react';
import { PILL_SAMPLE_KEY } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { useExecutionLiveStore } from '@/stores/executionLiveStore';
import { useEnvVarsStore } from '@/stores/envVarsStore';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { getUpstreamSchemas, type PathSuggestion } from '@/lib/upstream-schema';
import { groupSuggestions } from '@/lib/group-suggestions';
import { buildPillToken } from '@/lib/dataPillToken';
import { parsePillSample } from '@/lib/parsePillSample';
import { humanizePath } from '@/lib/humanize-path';
import { getNodeIcon } from '@/components/editor/nodes/nodeIcons';
import { cn } from '@/utils/cn';
import { BottomSheet } from '../BottomSheet';

// Sentinel id for the synthetic "Environment variables" section so it shares the
// same collapse/expand machinery as the real per-node groups without colliding
// with any node id.
const ENV_GROUP_ID = '__env';

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

  // Environment variables are a flat, workflow-independent pill source. They
  // resolve as single UPPER_SNAKE tokens (`{{MY_KEY}}`) at execution time.
  const envKeys = useEnvVarsStore((s) => s.keys);
  const loadEnvVars = useEnvVarsStore((s) => s.load);
  useEffect(() => {
    if (activePillField) void loadEnvVars();
  }, [activePillField, loadEnvVars]);

  if (!activePillField) return null;

  const insert = activePillField.insert;
  const pick = (e: ReactMouseEvent<HTMLButtonElement>, suggestion: PathSuggestion): void => {
    // Keep the focused input from blurring so activePillField survives the click.
    e.preventDefault();
    insert(buildPillToken(suggestion.ref, suggestion.path));
  };
  const pickEnv = (e: ReactMouseEvent<HTMLButtonElement>, key: string): void => {
    e.preventDefault();
    insert(`{{${key}}}`);
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

  const envOpen = !collapsed.has(ENV_GROUP_ID);
  const isEmpty = groups.length === 0 && envKeys.length === 0;

  const list = (
    <div role="listbox" aria-label="Upstream data pills" className="min-h-0 flex-1 overflow-y-auto">
      {isEmpty && (
        <p className="px-3 py-2 text-xs text-text-muted">No upstream outputs to reference yet.</p>
      )}
      {groups.length > 0 &&
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
        })}
      {envKeys.length > 0 && (
        <section
          key={ENV_GROUP_ID}
          data-testid="data-pill-env-group"
          className="border-b border-white/5 last:border-b-0"
        >
          <button
            type="button"
            data-testid="data-pill-group-header"
            onMouseDown={(e) => toggle(e, ENV_GROUP_ID)}
            aria-expanded={envOpen}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-text-secondary hover:bg-white/5 focus:bg-white/5 focus:outline-none"
          >
            {envOpen ? (
              <ChevronDown size={14} aria-hidden />
            ) : (
              <ChevronRight size={14} aria-hidden />
            )}
            <KeyRound size={14} className="shrink-0 text-accent-teal" aria-hidden />
            <span className="truncate">Environment variables</span>
            <span className="ml-auto shrink-0 text-text-muted">{envKeys.length}</span>
          </button>
          {envOpen && (
            <ul className="pb-1">
              {envKeys.map((key) => (
                <li key={key} role="option" aria-selected={false}>
                  <button
                    type="button"
                    data-testid="data-pill-env-option"
                    onMouseDown={(e) => pickEnv(e, key)}
                    title={`{{${key}}}`}
                    className="flex w-full items-center justify-between gap-2 py-1.5 pl-9 pr-3 text-left text-xs hover:bg-white/5 focus:bg-white/5 focus:outline-none"
                  >
                    <span className="truncate text-text-primary">{key}</span>
                    <span className="ml-2 shrink-0 text-text-muted">env</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
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
