import { useId } from 'react';
import { discordMessageReceivedConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { cn } from '@/utils/cn';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';

const inputClass = cn(
  'w-full rounded-md border border-white/5 bg-elevated px-3 py-2',
  'text-sm text-text-primary placeholder:text-text-muted',
  'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
);
const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function DiscordMessageReceivedForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const commandName = asString(config.commandName) || 'tietide-trigger';
  const guildId = asString(config.guildId);

  const cmdInputId = useId();
  const guildInputId = useId();

  const parsed = discordMessageReceivedConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    commandName,
    guildId: guildId || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const cmdIssue = issueFor('commandName');
  const guildIssue = issueFor('guildId');

  return (
    <div data-testid="discord-message-received-form" className="flex flex-col gap-4">
      <p className="rounded-md border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">
        Discord interactions require you to paste this workflow's Interactions Endpoint URL into the
        Discord Developer Portal. The trigger fires on the registered slash command — not on every
        channel message (Discord limitation).
      </p>

      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Discord bot connection</span>
        <ConnectionPicker
          provider="discord-bot"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="discord-message-received-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Discord bot connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={cmdInputId} className={labelClass}>
          Slash command name
        </label>
        <input
          id={cmdInputId}
          type="text"
          value={commandName}
          aria-invalid={cmdIssue !== null}
          onChange={(e) => updateNodeConfig(nodeId, { commandName: e.target.value })}
          className={inputClass}
        />
        {cmdIssue && (
          <p
            data-testid="discord-message-received-command-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {cmdIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={guildInputId} className={labelClass}>
          Guild ID (optional — global if blank)
        </label>
        <input
          id={guildInputId}
          type="text"
          value={guildId}
          placeholder="123456789012345678"
          aria-invalid={guildIssue !== null}
          onChange={(e) => updateNodeConfig(nodeId, { guildId: e.target.value || undefined })}
          className={inputClass}
        />
        {guildIssue && (
          <p
            data-testid="discord-message-received-guild-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {guildIssue}
          </p>
        )}
      </div>
    </div>
  );
}
