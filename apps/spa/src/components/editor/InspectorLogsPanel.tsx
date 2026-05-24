import { useMemo } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { useExecutionLiveStore, type NodeRunStatus } from '@/stores/executionLiveStore';
import { cn } from '@/utils/cn';

interface LogRow {
  nodeId: string;
  label: string;
  status: NodeRunStatus;
  startedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
}

const STATUS_DOT_CLASS: Record<NodeRunStatus, string> = {
  idle: 'bg-status-idle/60',
  running: 'bg-status-running animate-pulse',
  success: 'bg-status-success',
  failed: 'bg-status-failed',
  skipped: 'bg-text-muted',
};

const formatTime = (iso: string | null): string => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  } catch {
    return iso;
  }
};

const formatDuration = (ms: number | null): string => {
  if (ms === null) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

export function InspectorLogsPanel(): JSX.Element {
  const liveNodes = useExecutionLiveStore((s) => s.nodes);
  const editorNodes = useEditorStore((s) => s.nodes);

  const rows = useMemo<LogRow[]>(() => {
    const labels = new Map(editorNodes.map((n) => [n.id, n.data.label]));
    return Array.from(liveNodes.entries())
      .map(([nodeId, state]) => ({
        nodeId,
        label: labels.get(nodeId) ?? nodeId,
        status: state.status,
        startedAt: state.startedAt,
        durationMs: state.durationMs,
        errorMessage: state.error?.message ?? null,
      }))
      .sort((a, b) => (a.startedAt ?? '').localeCompare(b.startedAt ?? ''));
  }, [liveNodes, editorNodes]);

  if (rows.length === 0) {
    return (
      <div
        data-testid="inspector-logs-empty"
        className="flex h-full items-center justify-center px-3 py-6 text-center text-xs text-text-secondary"
      >
        No run yet
      </div>
    );
  }

  return (
    <ol
      data-testid="inspector-logs"
      className="flex h-full flex-col divide-y divide-white/5 overflow-y-auto text-[11px]"
    >
      {rows.map((row) => (
        <li
          key={row.nodeId}
          data-testid={`inspector-log-${row.nodeId}`}
          data-status={row.status}
          className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-2 px-2 py-1.5 text-text-secondary"
        >
          <span className={cn('h-2 w-2 rounded-full', STATUS_DOT_CLASS[row.status])} aria-hidden />
          <span className="tabular-nums text-text-muted">{formatTime(row.startedAt)}</span>
          <span className="truncate text-text-primary">
            {row.label}
            {row.errorMessage ? (
              <span className="ml-2 text-status-failed/90">— {row.errorMessage}</span>
            ) : null}
          </span>
          <span className="tabular-nums">{formatDuration(row.durationMs)}</span>
        </li>
      ))}
    </ol>
  );
}
