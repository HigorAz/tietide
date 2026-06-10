import { useId } from 'react';
import { slackInviteToChannelConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

function parseUsers(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function SlackInviteToChannelForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const channel = asString(config.channel);
  const users = Array.isArray(config.users) ? (config.users as string[]) : [];
  const usersRaw = asString(config.usersRaw) || users.join(', ');

  const channelId = useId();
  const usersId = useId();

  const parsed = slackInviteToChannelConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    channel,
    users: parseUsers(usersRaw),
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  return (
    <div data-testid="slack-invite-to-channel-form" className="flex flex-col gap-4">
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
        <label htmlFor={usersId} className={labelClass}>
          User IDs (comma or space separated)
        </label>
        <DataPillInput
          id={usersId}
          nodeId={nodeId}
          value={usersRaw}
          placeholder="U0111111, U0222222"
          aria-invalid={issueFor('users') !== null}
          onChange={(next) =>
            updateNodeConfig(nodeId, {
              usersRaw: next,
              users: parseUsers(next),
            })
          }
        />
        {issueFor('users') && (
          <p role="alert" className="text-xs text-red-400">
            {issueFor('users')}
          </p>
        )}
      </div>
    </div>
  );
}
