import { useId } from 'react';
import { discordAddRoleConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function DiscordAddRoleForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const guildId = asString(config.guildId);
  const userId = asString(config.userId);
  const roleId = asString(config.roleId);

  const guildFieldId = useId();
  const userFieldId = useId();
  const roleFieldId = useId();

  const parsed = discordAddRoleConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    guildId,
    userId,
    roleId,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const field = (
    id: string,
    key: 'guildId' | 'userId' | 'roleId',
    label: string,
    value: string,
    placeholder: string,
  ): JSX.Element => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <DataPillInput
        id={id}
        nodeId={nodeId}
        value={value}
        placeholder={placeholder}
        aria-invalid={issueFor(key) !== null}
        onChange={(next) => updateNodeConfig(nodeId, { [key]: next })}
      />
      {issueFor(key) && (
        <p role="alert" className="text-xs text-red-400">
          {issueFor(key)}
        </p>
      )}
    </div>
  );

  return (
    <div data-testid="discord-add-role-form" className="flex flex-col gap-4">
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

      {field(guildFieldId, 'guildId', 'Guild (server) ID', guildId, '111111111111111111')}
      {field(userFieldId, 'userId', 'User ID', userId, '222222222222222222')}
      {field(roleFieldId, 'roleId', 'Role ID', roleId, '333333333333333333')}
    </div>
  );
}
