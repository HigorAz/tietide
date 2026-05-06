import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { History, Loader2, RotateCcw, Diff } from 'lucide-react';
import { useEditorStore } from '@/stores/editorStore';
import { useVersionsStore } from '@/stores/versionsStore';
import { cn } from '@/utils/cn';
import type { WorkflowDefinition } from '@tietide/shared';
import type { WorkflowVersionSummary } from '@/api/workflowVersions';
import { VersionDiffModal } from './VersionDiffModal';

export function VersionHistoryPanel(): JSX.Element {
  const workflowId = useEditorStore((s) => s.workflowId);
  const loadWorkflow = useEditorStore((s) => s.loadWorkflow);
  const list = useVersionsStore((s) => s.list);
  const status = useVersionsStore((s) => s.listStatus);
  const error = useVersionsStore((s) => s.listError);
  const nextCursor = useVersionsStore((s) => s.listNextCursor);
  const fetchInitial = useVersionsStore((s) => s.fetchInitial);
  const loadMore = useVersionsStore((s) => s.loadMore);
  const restore = useVersionsStore((s) => s.restore);
  const storedWorkflowId = useVersionsStore((s) => s.workflowId);

  const [restoring, setRestoring] = useState<number | null>(null);
  const [compareTarget, setCompareTarget] = useState<number | null>(null);

  useEffect(() => {
    if (workflowId && storedWorkflowId !== workflowId) {
      void fetchInitial(workflowId);
    }
  }, [workflowId, storedWorkflowId, fetchInitial]);

  const handleRestore = async (version: number): Promise<void> => {
    if (!workflowId) return;
    setRestoring(version);
    try {
      const { definition } = await restore(workflowId, version);
      loadWorkflow({ id: workflowId, definition: definition as unknown as WorkflowDefinition });
    } finally {
      setRestoring(null);
    }
  };

  if (!workflowId) {
    return <Empty message="Save the workflow to start tracking versions." />;
  }

  if (status === 'loading' && list.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-text-secondary">
        <Loader2 aria-hidden="true" className="mr-1 h-3 w-3 animate-spin" /> Loading versions…
      </div>
    );
  }

  if (status === 'error') {
    return <Empty message={error ?? 'Failed to load versions.'} />;
  }

  if (list.length === 0) {
    return <Empty message="No versions yet." />;
  }

  return (
    <>
      <ul className="flex h-full flex-col gap-2 overflow-y-auto px-3 py-2 text-xs">
        {list.map((entry) => (
          <VersionRow
            key={entry.id}
            entry={entry}
            isRestoring={restoring === entry.version}
            onRestore={() => handleRestore(entry.version)}
            onCompare={() => setCompareTarget(entry.version)}
          />
        ))}
        {nextCursor && (
          <li>
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={status === 'loading'}
              className="w-full rounded border border-white/5 px-2 py-1 text-text-secondary transition hover:bg-white/5 disabled:opacity-50"
            >
              {status === 'loading' ? 'Loading…' : 'Load more'}
            </button>
          </li>
        )}
      </ul>
      {compareTarget !== null && workflowId && (
        <VersionDiffModal
          workflowId={workflowId}
          fromVersion={compareTarget}
          onClose={() => setCompareTarget(null)}
        />
      )}
    </>
  );
}

function VersionRow({
  entry,
  isRestoring,
  onRestore,
  onCompare,
}: {
  entry: WorkflowVersionSummary;
  isRestoring: boolean;
  onRestore: () => void;
  onCompare: () => void;
}): JSX.Element {
  return (
    <li className="flex items-center gap-2 rounded border border-white/5 bg-elevated/40 px-2 py-1.5">
      <History aria-hidden="true" className="h-3 w-3 text-accent-teal" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-text-primary">v{entry.version}</span>
          <span className="text-text-secondary">
            {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
          </span>
        </div>
        {entry.message ? <div className="truncate text-text-secondary">{entry.message}</div> : null}
      </div>
      <button
        type="button"
        onClick={onCompare}
        aria-label={`Compare v${entry.version}`}
        title="Compare to current"
        className="rounded p-1 text-text-secondary transition hover:bg-white/5 hover:text-text-primary"
      >
        <Diff aria-hidden="true" className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={onRestore}
        disabled={isRestoring}
        aria-label={`Restore v${entry.version}`}
        title="Load this version into the editor"
        className={cn(
          'rounded p-1 text-text-secondary transition hover:bg-white/5 hover:text-text-primary',
          isRestoring && 'animate-pulse',
        )}
      >
        <RotateCcw aria-hidden="true" className="h-3 w-3" />
      </button>
    </li>
  );
}

function Empty({ message }: { message: string }): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center px-3 py-6 text-center text-xs text-text-secondary">
      {message}
    </div>
  );
}
