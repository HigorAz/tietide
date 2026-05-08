import { useId } from 'react';
import { outlookSearchConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { cn } from '@/utils/cn';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const inputClass = cn(
  'w-full rounded-md border border-white/5 bg-elevated px-3 py-2',
  'text-sm text-text-primary placeholder:text-text-muted',
  'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
);
const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function OutlookSearchForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const query = asString(config.query);
  const maxResults = typeof config.maxResults === 'number' ? config.maxResults : undefined;
  const mockOnDryRun = config.mockOnDryRun === true;

  const queryId = useId();
  const maxId = useId();
  const mockId = useId();

  const parsed = outlookSearchConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    query,
    maxResults,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (f: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === f)?.message ?? null);
  const connectionIssue = issueFor('connectionId');
  const queryIssue = issueFor('query');
  const maxIssue = issueFor('maxResults');

  return (
    <div data-testid="outlook-search-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Connection</span>
        <ConnectionPicker
          provider="microsoft"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connectionIssue && (
          <p
            data-testid="outlook-search-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Microsoft connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={queryId} className={labelClass}>
          Query (Microsoft Search syntax)
        </label>
        <DataPillInput
          id={queryId}
          nodeId={nodeId}
          value={query}
          placeholder="subject:invoice"
          aria-invalid={queryIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { query: next })}
        />
        {queryIssue && (
          <p data-testid="outlook-search-query-error" role="alert" className="text-xs text-red-400">
            {queryIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={maxId} className={labelClass}>
          Max results (optional, ≤ 50)
        </label>
        <input
          id={maxId}
          type="number"
          min={1}
          max={50}
          value={maxResults ?? ''}
          placeholder="10"
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              updateNodeConfig(nodeId, { maxResults: undefined });
              return;
            }
            const n = Number(raw);
            if (Number.isFinite(n)) updateNodeConfig(nodeId, { maxResults: n });
          }}
          className={inputClass}
        />
        {maxIssue && (
          <p data-testid="outlook-search-max-error" role="alert" className="text-xs text-red-400">
            {maxIssue}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          id={mockId}
          type="checkbox"
          checked={mockOnDryRun}
          onChange={(e) => updateNodeConfig(nodeId, { mockOnDryRun: e.target.checked })}
          className="h-4 w-4 rounded border-white/10 bg-elevated text-accent-teal focus:ring-accent-teal"
        />
        <label htmlFor={mockId} className="text-xs text-text-secondary">
          Skip Outlook call on test runs (return mocked output)
        </label>
      </div>
    </div>
  );
}
