import { useId } from 'react';
import { slackUpdateMessageConfigSchema } from '@tietide/shared';
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

export function SlackUpdateMessageForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const channel = asString(config.channel);
  const ts = asString(config.ts);
  const text = asString(config.text);

  const channelId = useId();
  const tsId = useId();
  const textId = useId();

  const parsed = slackUpdateMessageConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    channel,
    ts,
    text,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  return (
    <div data-testid="slack-update-message-form" className="flex flex-col gap-4">
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
          value={ts}
          placeholder="1717000000.000100"
          aria-invalid={issueFor('ts') !== null}
          onChange={(next) => updateNodeConfig(nodeId, { ts: next })}
        />
        {issueFor('ts') && (
          <p role="alert" className="text-xs text-red-400">
            {issueFor('ts')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={textId} className={labelClass}>
          New message text
        </label>
        <textarea
          id={textId}
          value={text}
          rows={4}
          placeholder="Updated: {{trigger.status}}"
          aria-invalid={issueFor('text') !== null}
          onChange={(e) => updateNodeConfig(nodeId, { text: e.target.value })}
          className={cn(inputClass, 'font-mono text-xs')}
        />
        {issueFor('text') && (
          <p role="alert" className="text-xs text-red-400">
            {issueFor('text')}
          </p>
        )}
      </div>
    </div>
  );
}
