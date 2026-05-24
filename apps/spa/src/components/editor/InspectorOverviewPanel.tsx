import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { MiniMap } from 'reactflow';
import { NODE_CATALOG, NodeCategory } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { listExecutions } from '@/api/executions';
import { cn } from '@/utils/cn';
import type { WorkflowExecution } from '@tietide/shared';
import { APP_INFO, getAppIdForNodeType, type AppId } from './nodeApps';

interface LastRunInfo {
  status: WorkflowExecution['status'];
  finishedAt: string | null;
  durationMs: number | null;
}

const STATUS_DOT: Record<WorkflowExecution['status'], string> = {
  PENDING: 'bg-status-idle/60',
  RUNNING: 'bg-status-running animate-pulse',
  SUCCESS: 'bg-status-success',
  FAILED: 'bg-status-failed',
  CANCELLED: 'bg-text-muted',
  SKIPPED: 'bg-text-muted',
};

const formatRelative = (iso: string | null): string => {
  if (!iso) return '—';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '—';
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const formatDuration = (ms: number | null): string => {
  if (ms === null) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

export function InspectorOverviewPanel(): JSX.Element {
  const workflowId = useEditorStore((s) => s.workflowId);
  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const [lastRun, setLastRun] = useState<LastRunInfo | null>(null);
  const [showMiniMap, setShowMiniMap] = useState(false);

  // Fetch the most recent execution to surface "last run" pill. Cheap GET; we
  // re-fetch on every panel mount so the user always sees fresh state when
  // they switch back to the Overview tab.
  useEffect(() => {
    if (!workflowId) return;
    let cancelled = false;
    listExecutions(workflowId, { pageSize: 1 })
      .then((response) => {
        if (cancelled) return;
        const latest = response.items[0];
        if (!latest) {
          setLastRun(null);
          return;
        }
        const finished = latest.finishedAt ?? null;
        const started = latest.startedAt ?? null;
        const durationMs =
          finished && started
            ? Math.max(0, Date.parse(String(finished)) - Date.parse(String(started)))
            : null;
        setLastRun({
          status: latest.status,
          finishedAt: finished ? new Date(finished as unknown as string).toISOString() : null,
          durationMs,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setLastRun(null);
      });
    return () => {
      cancelled = true;
    };
  }, [workflowId]);

  const triggerLabel = useMemo<string>(() => {
    const triggerNode = nodes.find((n) => {
      const cat = NODE_CATALOG.find((d) => d.type === n.data.nodeType)?.category;
      return cat === NodeCategory.TRIGGER;
    });
    if (!triggerNode) return 'No trigger';
    const def = NODE_CATALOG.find((d) => d.type === triggerNode.data.nodeType);
    return def?.name ?? 'Trigger';
  }, [nodes]);

  const providerApps = useMemo<{ appId: AppId; label: string; count: number }[]>(() => {
    const counts = new Map<AppId, number>();
    for (const node of nodes) {
      const appId = getAppIdForNodeType(node.data.nodeType);
      if (!appId || appId === 'core') continue;
      counts.set(appId, (counts.get(appId) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([appId, count]) => ({ appId, label: APP_INFO[appId]?.label ?? appId, count }))
      .sort((a, b) => b.count - a.count);
  }, [nodes]);

  const validationIssues = useMemo<string[]>(() => {
    const issues: string[] = [];
    if (nodes.length === 0) {
      return ['Empty workflow — add a trigger to start.'];
    }
    const triggerCount = nodes.filter((n) => {
      const cat = NODE_CATALOG.find((d) => d.type === n.data.nodeType)?.category;
      return cat === NodeCategory.TRIGGER;
    }).length;
    if (triggerCount === 0) issues.push("No trigger — workflow can't start.");
    if (triggerCount > 1) issues.push(`${triggerCount} triggers — only one allowed.`);

    const connectedIds = new Set<string>();
    for (const edge of edges) {
      connectedIds.add(edge.source);
      connectedIds.add(edge.target);
    }
    if (nodes.length > 1) {
      const orphan = nodes.filter((n) => !connectedIds.has(n.id)).length;
      if (orphan > 0)
        issues.push(`${orphan} disconnected node${orphan === 1 ? '' : 's'} — not reachable.`);
    }
    return issues;
  }, [nodes, edges]);

  const toggleMiniMap = useCallback(() => setShowMiniMap((v) => !v), []);

  return (
    <div
      data-testid="inspector-overview-panel"
      className="flex h-full flex-col gap-3 overflow-y-auto px-3 py-2 text-[11px]"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full border border-white/10 bg-elevated px-2 py-0.5 text-text-primary">
          {nodes.length} {nodes.length === 1 ? 'node' : 'nodes'}
        </span>
        <span className="rounded-full border border-white/10 bg-elevated px-2 py-0.5 text-text-primary">
          {edges.length} {edges.length === 1 ? 'edge' : 'edges'}
        </span>
        <span className="rounded-full border border-accent-teal/30 bg-accent-teal/10 px-2 py-0.5 text-accent-teal">
          {triggerLabel}
        </span>
      </div>

      {providerApps.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-text-secondary">
          <span className="text-[10px] uppercase tracking-wide text-text-muted">Providers</span>
          {providerApps.map((app) => (
            <span key={app.appId} className="text-text-primary">
              {app.label}
              {app.count > 1 ? ` (${app.count})` : ''}
            </span>
          ))}
        </div>
      )}

      <div className="rounded border border-white/5 bg-elevated px-3 py-2">
        <div className="text-[10px] uppercase tracking-wide text-text-muted">Last run</div>
        {lastRun ? (
          <div className="mt-1 flex items-center gap-2">
            <span className={cn('h-2 w-2 rounded-full', STATUS_DOT[lastRun.status])} aria-hidden />
            <span className="font-medium text-text-primary">{lastRun.status}</span>
            {lastRun.durationMs !== null && (
              <span className="tabular-nums text-text-secondary">
                {formatDuration(lastRun.durationMs)}
              </span>
            )}
            <span className="ml-auto text-text-muted">{formatRelative(lastRun.finishedAt)}</span>
          </div>
        ) : (
          <div className="mt-1 text-text-secondary">No runs yet — click Run or Test.</div>
        )}
      </div>

      {validationIssues.length > 0 && (
        <ul className="space-y-1">
          {validationIssues.map((issue, i) => (
            <li
              key={i}
              className="flex items-start gap-1.5 rounded bg-warning/10 px-2 py-1 text-warning"
            >
              <AlertTriangle size={11} className="mt-0.5 shrink-0" aria-hidden />
              <span>{issue}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto">
        <button
          type="button"
          onClick={toggleMiniMap}
          aria-expanded={showMiniMap}
          className="flex w-full items-center gap-1.5 rounded border border-white/5 bg-elevated px-2 py-1 text-[10px] uppercase tracking-wide text-text-secondary hover:bg-white/5 hover:text-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-teal"
        >
          {showMiniMap ? (
            <ChevronDown size={11} aria-hidden />
          ) : (
            <ChevronRight size={11} aria-hidden />
          )}
          <span>Mini-map</span>
        </button>
        {showMiniMap && (
          <div className="mt-2 h-32 overflow-hidden rounded border border-white/5">
            <MiniMap pannable zoomable className="!relative !h-full !w-full" />
          </div>
        )}
      </div>
    </div>
  );
}
