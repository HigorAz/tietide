import { useId } from 'react';
import { slackAddReactionConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function SlackAddReactionForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const channel = asString(config.channel);
  const timestamp = asString(config.timestamp);
  const name = asString(config.name);

  const channelId = useId();
  const tsId = useId();
  const nameId = useId();

  const parsed = slackAddReactionConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    channel,
    timestamp,
    name,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  return (
    <div data-testid="slack-add-reaction-form" className="flex flex-col gap-4">
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
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={channelId} className={labelClass}>
          Channel ID
        </label>
        <DataPillInput
          id={channelId}
          nodeId={nodeId}
          value={channel}
          placeholder="C0123ABCDEF"
          aria-invalid={issueFor('channel') !== null}
          onChange={(next) => updateNodeConfig(nodeId, { channel: next })}
        />
        {issueFor('channel') && (
          <p role="alert" className="text-xs text-red-400">
            {issueFor('channel')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={tsId} className={labelClass}>
          Message timestamp (ts)
        </label>
        <DataPillInput
          id={tsId}
          nodeId={nodeId}
          value={timestamp}
          placeholder="1717000000.000100"
          aria-invalid={issueFor('timestamp') !== null}
          onChange={(next) => updateNodeConfig(nodeId, { timestamp: next })}
        />
        {issueFor('timestamp') && (
          <p role="alert" className="text-xs text-red-400">
            {issueFor('timestamp')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className={labelClass}>
          Emoji name (no colons)
        </label>
        <DataPillInput
          id={nameId}
          nodeId={nodeId}
          value={name}
          placeholder="thumbsup"
          aria-invalid={issueFor('name') !== null}
          onChange={(next) => updateNodeConfig(nodeId, { name: next })}
        />
        {issueFor('name') && (
          <p role="alert" className="text-xs text-red-400">
            {issueFor('name')}
          </p>
        )}
      </div>
    </div>
  );
}
