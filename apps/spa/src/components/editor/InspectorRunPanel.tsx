import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { useExecutionLiveStore, type NodeRunState } from '@/stores/executionLiveStore';
import { cn } from '@/utils/cn';
import { DataViewer } from './dataviewer/DataViewer';
import { CopyJsonButton } from './run/CopyJsonButton';
import { ErrorCard } from './run/ErrorCard';
import { pillRefForAlias } from './run/pillRef';

interface RunEntry {
  id: string;
  label: string;
  alias: string | undefined;
  state: NodeRunState;
}

const formatDuration = (ms: number | null): string => {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

interface DataPaneProps {
  label: string;
  testId: string;
  children: ReactNode;
  copyValue: unknown;
}

/**
 * A labeled data pane: header (label + copy-full-JSON button) over the shared
 * DataViewer. Preserves the label + Copy affordance the old JsonBlock panes had
 * (locked decision: copy-full-JSON must survive on both Input and Output panes).
 */
function DataPane({ label, testId, children, copyValue }: DataPaneProps): JSX.Element {
  return (
    <div data-testid={testId} className="space-y-1">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-text-secondary">
        <span>{label}</span>
        <CopyJsonButton value={copyValue} />
      </div>
      {children}
    </div>
  );
}

export function InspectorRunPanel(): JSX.Element {
  const liveNodes = useExecutionLiveStore((s) => s.nodes);
  const viewAtTime = useExecutionLiveStore((s) => s.viewAtTime);
  const editorNodes = useEditorStore((s) => s.nodes);
  const selectNode = useEditorStore((s) => s.selectNode);
  const setViewMode = useEditorStore((s) => s.setViewMode);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const entries: RunEntry[] = useMemo(() => {
    const byId = new Map(editorNodes.map((n) => [n.id, n.data]));
    return Array.from(liveNodes.entries())
      .filter(([, state]) => {
        if (viewAtTime === null) return true;
        return state.startedAt !== null && state.startedAt <= viewAtTime;
      })
      .map(([id, state]) => ({
        id,
        state,
        label: byId.get(id)?.label ?? id,
        alias: byId.get(id)?.alias,
      }))
      .sort((a, b) => (a.state.startedAt ?? '').localeCompare(b.state.startedAt ?? ''));
  }, [liveNodes, editorNodes, viewAtTime]);

  useEffect(() => {
    if (entries.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !entries.some((e) => e.id === selectedId)) {
      setSelectedId(entries[0].id);
    }
  }, [entries, selectedId]);

  if (entries.length === 0) {
    return (
      <div
        data-testid="inspector-run-empty"
        className="flex h-full items-center justify-center px-3 py-6 text-center text-xs text-text-secondary"
      >
        No run yet
      </div>
    );
  }

  const selected = entries.find((e) => e.id === selectedId) ?? entries[0];
  const outputRef = pillRefForAlias(selected.alias);

  return (
    <div data-testid="inspector-run-panel" className="flex h-full min-h-0">
      <ul
        role="tablist"
        aria-label="Executed nodes"
        className="w-32 shrink-0 overflow-y-auto border-r border-white/5"
      >
        {entries.map((entry) => {
          const active = entry.id === selected.id;
          return (
            <li key={entry.id}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`run-node-tab-${entry.id}`}
                data-status={entry.state.status}
                onClick={() => setSelectedId(entry.id)}
                className={cn(
                  'w-full truncate px-2 py-1.5 text-left text-xs transition',
                  active
                    ? 'bg-accent-teal/15 text-accent-teal'
                    : 'text-text-secondary hover:bg-white/5 hover:text-text-primary',
                )}
              >
                {entry.label}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-1 flex-col gap-3 overflow-auto p-3">
        <div className="flex items-center gap-2 text-xs">
          <span
            data-testid="run-node-status"
            data-status={selected.state.status}
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              selected.state.status === 'running' && 'bg-status-running/15 text-status-running',
              selected.state.status === 'success' && 'bg-status-success/15 text-status-success',
              selected.state.status === 'failed' && 'bg-status-failed/15 text-status-failed',
              selected.state.status === 'skipped' && 'bg-white/5 text-text-secondary',
              selected.state.status === 'idle' && 'bg-white/5 text-text-secondary',
            )}
          >
            {selected.state.status}
          </span>
          <span data-testid="run-node-duration" className="text-text-secondary">
            {formatDuration(selected.state.durationMs)}
          </span>
        </div>

        <DataPane label="Input" testId="run-node-input-pane" copyValue={selected.state.input}>
          <DataViewer value={selected.state.input} testId="run-node-input" />
        </DataPane>
        <DataPane label="Output" testId="run-node-output-pane" copyValue={selected.state.output}>
          <DataViewer value={selected.state.output} testId="run-node-output" pillRef={outputRef} />
        </DataPane>

        {selected.state.iterations && selected.state.iterations.length > 0 && (
          <div data-testid="run-node-iterations" className="space-y-1">
            <div className="text-[11px] uppercase tracking-wide text-text-secondary">
              Iterations ({selected.state.iterations.length})
            </div>
            <ul className="rounded border border-white/5 bg-deep-blue/40">
              {selected.state.iterations.map((it) => (
                <li
                  key={it.index}
                  data-testid={`run-iteration-${it.index}`}
                  data-status={it.status}
                  className="flex items-center justify-between gap-2 border-b border-white/5 px-2 py-1.5 text-[11px] last:border-b-0"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        it.status === 'running' && 'bg-status-running/15 text-status-running',
                        it.status === 'success' && 'bg-status-success/15 text-status-success',
                        it.status === 'failed' && 'bg-status-failed/15 text-status-failed',
                        it.status !== 'running' &&
                          it.status !== 'success' &&
                          it.status !== 'failed' &&
                          'bg-white/5 text-text-secondary',
                      )}
                    >
                      {it.status}
                    </span>
                    <span className="text-text-primary">
                      Iteration {it.index + 1} / {it.total}
                    </span>
                  </span>
                  <span className="text-text-secondary">{formatDuration(it.durationMs)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {selected.state.error && (
          <ErrorCard
            error={selected.state.error}
            testId="run-node-error"
            onFixInConfigure={() => {
              selectNode(selected.id);
              setViewMode('configure');
            }}
          />
        )}
      </div>
    </div>
  );
}
