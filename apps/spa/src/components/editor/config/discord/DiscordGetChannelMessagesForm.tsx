import { useId } from 'react';
import { discordGetChannelMessagesConfigSchema } from '@tietide/shared';
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

export function DiscordGetChannelMessagesForm({
  nodeId,
  config,
}: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const channelId = asString(config.channelId);
  const limit = typeof config.limit === 'number' ? config.limit : '';

  const channelFieldId = useId();
  const limitId = useId();

  const parsed = discordGetChannelMessagesConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    channelId,
    limit: typeof config.limit === 'number' ? config.limit : undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  return (
    <div data-testid="discord-get-channel-messages-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Discord bot connection</span>
        <ConnectionPicker
          provider="discord-bot"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {issueFor('connectionId') && (
          <p role="alert" className="text-xs text-red-400">
            Select a Discord bot connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={channelFieldId} className={labelClass}>
          Channel ID
        </label>
        <DataPillInput
          id={channelFieldId}
          nodeId={nodeId}
          value={channelId}
          placeholder="900900900900900900"
          aria-invalid={issueFor('channelId') !== null}
          onChange={(next) => updateNodeConfig(nodeId, { channelId: next })}
        />
        {issueFor('channelId') && (
          <p role="alert" className="text-xs text-red-400">
            {issueFor('channelId')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={limitId} className={labelClass}>
          Limit (1–100)
        </label>
        <input
          id={limitId}
          type="number"
          min={1}
          max={100}
          value={limit}
          placeholder="50"
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
