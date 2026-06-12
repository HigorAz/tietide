import { useEditorStore } from '@/stores/editorStore';
import { useExecutionLiveStore } from '@/stores/executionLiveStore';
import { cn } from '@/utils/cn';
import { ConfigFieldList } from './run/ConfigFieldList';
import { CopyJsonButton } from './run/CopyJsonButton';
import { ErrorCard } from './run/ErrorCard';
import { RunSectionTimeline, type RunSection } from './run/RunSectionTimeline';
import { DataViewer } from './dataviewer/DataViewer';
import { extractRows } from './dataviewer/DataTable';
import { pillRefForAlias } from './run/pillRef';

const formatDuration = (ms: number | null): string => {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

/** '[N items]' badge when the output is a tabular array (or has a first array-valued key). */
function outputBadge(output: unknown): string | undefined {
  const rows = extractRows(output);
  return rows === null ? undefined : `${rows.length} items`;
}

export interface NodeRunInspectionProps {
  nodeId: string;
  config: Record<string, unknown>;
}

/**
 * Result view (locked sketch 002-D): a section timeline — Configuration → Input →
 * (Error when failed) → Output — on a status rail. Configuration is a labeled
 * field list, Input/Output are the shared Tree|Table|Raw DataViewer, and a failed
 * step inserts the structured ErrorCard before Output. Every data section header
 * carries a copy-full-JSON button; Fix in Configure flips the editor to configure.
 */
export function NodeRunInspection({ nodeId, config }: NodeRunInspectionProps): JSX.Element {
  const liveState = useExecutionLiveStore((s) => s.nodes.get(nodeId)) ?? null;
  const alias = useEditorStore((s) => s.nodes.find((n) => n.id === nodeId)?.data.alias);
  const setViewMode = useEditorStore((s) => s.setViewMode);
  const outputRef = pillRefForAlias(alias);

  // Configuration is always known, even before/without a run.
  const configSection: RunSection = {
    id: 'configuration',
    title: 'Configuration',
    tone: 'neutral',
    defaultOpen: false,
    headerActions: <CopyJsonButton value={config} />,
    children: <ConfigFieldList config={config} />,
  };

  if (liveState === null) {
    return (
      <div data-testid="node-run-inspection" className="space-y-3 text-xs">
        <RunSectionTimeline sections={[configSection]} />
        <div className="rounded-md border border-dashed border-white/10 bg-deep-blue/40 p-3 text-center text-text-secondary">
          This node was not executed in this run.
        </div>
      </div>
    );
  }

  const failed = liveState.status === 'failed';
  const outputTone = liveState.status === 'success' ? 'success' : failed ? 'failed' : 'neutral';

  const sections: RunSection[] = [
    configSection,
    {
      id: 'input',
      title: 'Input',
      tone: 'neutral',
      defaultOpen: true,
      headerActions: <CopyJsonButton value={liveState.input} />,
      children: <DataViewer value={liveState.input} testId="node-run-input" />,
    },
  ];

  if (liveState.error) {
    sections.push({
      id: 'error',
      title: 'Error',
      tone: 'failed',
      defaultOpen: true,
      children: (
        <ErrorCard
          error={liveState.error}
          testId="node-run-error"
          onFixInConfigure={() => setViewMode('configure')}
        />
      ),
    });
  }

  const failedWithoutOutput = failed && liveState.output === null;
  sections.push({
    id: 'output',
    title: 'Output',
    tone: outputTone,
    defaultOpen: true,
    badge: failedWithoutOutput ? undefined : outputBadge(liveState.output),
    ...(failedWithoutOutput ? {} : { headerActions: <CopyJsonButton value={liveState.output} /> }),
    children: failedWithoutOutput ? (
      <p data-testid="node-run-output" className="text-[11.5px] italic text-text-secondary">
        No output — the node failed before producing data.
      </p>
    ) : (
      <DataViewer value={liveState.output} testId="node-run-output" pillRef={outputRef} />
    ),
  });

  return (
    <div data-testid="node-run-inspection" className="space-y-3 text-xs">
      <div className="flex items-center gap-2">
        <span
          data-testid="node-run-status"
          data-status={liveState.status}
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
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

      <RunSectionTimeline sections={sections} />
    </div>
  );
}
