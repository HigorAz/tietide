import { useId } from 'react';
import { discordPostWebhookConfigSchema } from '@tietide/shared';
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

export function DiscordPostWebhookForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const content = asString(config.content);
  const username = asString(config.username);
  const avatarUrl = asString(config.avatarUrl);

  const contentId = useId();
  const usernameId = useId();
  const avatarId = useId();

  const parsed = discordPostWebhookConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    content,
    username: username || undefined,
    avatarUrl: avatarUrl || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const contentIssue = issueFor('content');

  return (
    <div data-testid="discord-post-webhook-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Discord webhook connection</span>
        <ConnectionPicker
          provider="discord"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="discord-post-webhook-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Discord webhook connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={contentId} className={labelClass}>
          Message
        </label>
        <textarea
          id={contentId}
          value={content}
          rows={4}
          aria-invalid={contentIssue !== null}
          onChange={(e) => updateNodeConfig(nodeId, { content: e.target.value })}
          className={cn(inputClass, 'font-mono text-xs')}
        />
        {contentIssue && (
          <p
            data-testid="discord-post-webhook-content-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {contentIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={usernameId} className={labelClass}>
          Username override (optional)
        </label>
        <DataPillInput
          id={usernameId}
          nodeId={nodeId}
          value={username}
          placeholder="TieTide"
          onChange={(next) => updateNodeConfig(nodeId, { username: next || undefined })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={avatarId} className={labelClass}>
          Avatar URL (optional)
        </label>
        <DataPillInput
          id={avatarId}
          nodeId={nodeId}
          value={avatarUrl}
          placeholder="https://example.com/icon.png"
          onChange={(next) => updateNodeConfig(nodeId, { avatarUrl: next || undefined })}
        />
      </div>
    </div>
  );
}
