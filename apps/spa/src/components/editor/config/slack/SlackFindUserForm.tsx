import { useId } from 'react';
import { slackFindUserConfigSchema, SLACK_USER_LOOKUP_MODES } from '@tietide/shared';
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

export function SlackFindUserForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const mode = SLACK_USER_LOOKUP_MODES.includes(config.mode as never)
    ? (config.mode as string)
    : 'email';
  const query = asString(config.query);

  const modeId = useId();
  const queryId = useId();

  const parsed = slackFindUserConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    mode,
    query,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const queryIssue = issueFor('query');

  return (
    <div data-testid="slack-find-user-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Slack connection</span>
        <ConnectionPicker
          provider="slack"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p role="alert" className="text-xs text-red-400">
            Select a Slack connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={modeId} className={labelClass}>
          Look up by
        </label>
        <select
          id={modeId}
          value={mode}
          onChange={(e) => updateNodeConfig(nodeId, { mode: e.target.value })}
          className={inputClass}
        >
          <option value="email">Email</option>
          <option value="name">Name</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={queryId} className={labelClass}>
          {mode === 'email' ? 'Email address' : 'Name (substring match)'}
        </label>
        <DataPillInput
          id={queryId}
          nodeId={nodeId}
          value={query}
          placeholder={mode === 'email' ? 'jane@acme.com' : 'Jane Doe'}
          aria-invalid={queryIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { query: next })}
        />
        {queryIssue && (
          <p role="alert" className="text-xs text-red-400">
            {queryIssue}
          </p>
        )}
      </div>
    </div>
  );
}
