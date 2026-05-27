import { useId } from 'react';
import { slackGetChannelHistoryConfigSchema } from '@tietide/shared';
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

export function SlackGetChannelHistoryForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const channel = asString(config.channel);
  const limit = typeof config.limit === 'number' ? config.limit : '';

  const channelId = useId();
  const limitId = useId();

  const parsed = slackGetChannelHistoryConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    channel,
    limit: typeof config.limit === 'number' ? config.limit : undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  return (
    <div data-testid="slack-get-channel-history-form" className="flex flex-col gap-4">
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
        <label htmlFor={limitId} className={labelClass}>
          Limit (1–200)
        </label>
        <input
          id={limitId}
          type="number"
          min={1}
          max={200}
          value={limit}
          placeholder="100"
          onChange={(e) =>
            updateNodeConfig(nodeId, {
              limit: e.target.value === '' ? undefined : Number(e.target.value),
            })
          }
          className={inputClass}
        />
        {issueFor('limit') && (
          <p role="alert" className="text-xs text-red-400">
            {issueFor('limit')}
          </p>
        )}
      </div>
    </div>
  );
}
