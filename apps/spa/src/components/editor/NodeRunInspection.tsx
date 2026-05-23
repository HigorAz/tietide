import { useExecutionLiveStore } from '@/stores/executionLiveStore';
import { cn } from '@/utils/cn';
import { JsonBlock } from './preview/JsonBlock';

const formatDuration = (ms: number | null): string => {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

export interface NodeRunInspectionProps {
  nodeId: string;
  config: Record<string, unknown>;
}

export function NodeRunInspection({ nodeId, config }: NodeRunInspectionProps): JSX.Element {
  const liveState = useExecutionLiveStore((s) => s.nodes.get(nodeId)) ?? null;

  return (
    <div data-testid="node-run-inspection" className="space-y-3 text-xs">
      <JsonBlock label="Config (read-only)" testId="node-run-config" value={config} />

      {liveState === null ? (
        <div className="rounded border border-dashed border-white/10 bg-deep-blue/30 p-3 text-center text-text-secondary">
          This node was not executed in this run.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span
              data-testid="node-run-status"
              data-status={liveState.status}
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                liveState.status === 'running' && 'bg-status-running/15 text-status-running',
                liveState.status === 'success' && 'bg-status-success/15 text-status-success',
                liveState.status === 'failed' && 'bg-status-failed/15 text-status-failed',
                liveState.status === 'skipped' && 'bg-white/5 text-text-secondary',
                liveState.status === 'idle' && 'bg-white/5 text-text-secondary',
              )}
            >
              {liveState.status}
            </span>
            <span className="text-text-secondary">{formatDuration(liveState.durationMs)}</span>
          </div>

          <JsonBlock label="Input" testId="node-run-input" value={liveState.input} />
          <JsonBlock label="Output" testId="node-run-output" value={liveState.output} />

          {liveState.error && (
            <div data-testid="node-run-error" className="space-y-1">
              <div className="text-[11px] uppercase tracking-wide text-status-failed">Error</div>
              <pre className="whitespace-pre-wrap break-words rounded bg-status-failed/10 p-2 text-[11px] leading-tight text-status-failed">
                {liveState.error.message}
                {liveState.error.code ? `\n[${liveState.error.code}]` : ''}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
