import { useId } from 'react';
import { slackSearchMessagesConfigSchema } from '@tietide/shared';
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

export function SlackSearchMessagesForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const query = asString(config.query);
  const count = typeof config.count === 'number' ? config.count : '';
  const sort = asString(config.sort) || 'score';

  const queryId = useId();
  const countId = useId();
  const sortId = useId();

  const parsed = slackSearchMessagesConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    query,
    count: typeof config.count === 'number' ? config.count : undefined,
    sort: config.sort || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  return (
    <div data-testid="slack-search-messages-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Slack connection</span>
        <ConnectionPicker
          provider="slack"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {issueFor('connectionId') && (
          <p role="alert" className="text-xs text-red-400">
            Select a Slack connection.
          </p>
        )}
        <p className="text-xs text-text-muted">
          Requires a connection authorized with the <code>search:read</code> user scope.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={queryId} className={labelClass}>
          Search query
        </label>
        <DataPillInput
          id={queryId}
          nodeId={nodeId}
          value={query}
          placeholder="budget in:#finance from:@jane"
          aria-invalid={issueFor('query') !== null}
          onChange={(next) => updateNodeConfig(nodeId, { query: next })}
        />
        {issueFor('query') && (
          <p role="alert" className="text-xs text-red-400">
            {issueFor('query')}
          </p>
        )}
      </div>

      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor={countId} className={labelClass}>
            Count (1–100)
          </label>
          <input
            id={countId}
            type="number"
            min={1}
            max={100}
            value={count}
            placeholder="20"
            onChange={(e) =>
              updateNodeConfig(nodeId, {
                count: e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
            className={inputClass}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor={sortId} className={labelClass}>
            Sort
          </label>
          <select
            id={sortId}
            value={sort}
            onChange={(e) => updateNodeConfig(nodeId, { sort: e.target.value })}
            className={inputClass}
          >
            <option value="score">Relevance</option>
            <option value="timestamp">Most recent</option>
          </select>
        </div>
      </div>
    </div>
  );
}
