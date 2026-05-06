import { useEffect, useMemo, useState } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { useExecutionLiveStore, type NodeRunState } from '@/stores/executionLiveStore';
import { cn } from '@/utils/cn';

interface RunEntry {
  id: string;
  label: string;
  state: NodeRunState;
}

const formatDuration = (ms: number | null): string => {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

const stringify = (value: unknown): string => {
  if (value === undefined) return 'null';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

interface JsonBlockProps {
  label: string;
  testId: string;
  value: unknown;
}

function JsonBlock({ label, testId, value }: JsonBlockProps): JSX.Element {
  const text = stringify(value);
  const [copied, setCopied] = useState(false);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable / permission denied — degrade silently.
    }
  };

  return (
    <div data-testid={testId} className="space-y-1">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-text-secondary">
        <span>{label}</span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={`Copy ${label} JSON`}
          className="rounded px-1.5 py-0.5 text-[10px] text-text-secondary hover:bg-white/5 hover:text-accent-teal focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-teal"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="max-h-32 overflow-auto rounded bg-deep-blue/40 p-2 text-[11px] leading-tight text-text-primary">
        {text}
      </pre>
    </div>
  );
}

export function InspectorRunPanel(): JSX.Element {
  const liveNodes = useExecutionLiveStore((s) => s.nodes);
  const editorNodes = useEditorStore((s) => s.nodes);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const entries: RunEntry[] = useMemo(() => {
    const labels = new Map(editorNodes.map((n) => [n.id, n.data.label]));
    return Array.from(liveNodes.entries())
      .map(([id, state]) => ({ id, state, label: labels.get(id) ?? id }))
      .sort((a, b) => (a.state.startedAt ?? '').localeCompare(b.state.startedAt ?? ''));
  }, [liveNodes, editorNodes]);

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

        <JsonBlock label="Input" testId="run-node-input" value={selected.state.input} />
        <JsonBlock label="Output" testId="run-node-output" value={selected.state.output} />

        {selected.state.error && (
          <div data-testid="run-node-error" className="space-y-1">
            <div className="text-[11px] uppercase tracking-wide text-status-failed">Error</div>
            <pre className="max-h-32 overflow-auto rounded bg-status-failed/10 p-2 text-[11px] leading-tight text-status-failed">
              {selected.state.error.message}
              {selected.state.error.code ? `\n[${selected.state.error.code}]` : ''}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
