import { useId } from 'react';
import { slackPostMessageConfigSchema } from '@tietide/shared';
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

export function SlackPostMessageForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const channel = asString(config.channel);
  const text = asString(config.text);
  const threadTs = asString(config.threadTs);
  const mockOnDryRun = config.mockOnDryRun === true;

  const channelId = useId();
  const textFieldId = useId();
  const threadId = useId();
  const mockId = useId();

  const parsed = slackPostMessageConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    channel,
    text,
    threadTs: threadTs || undefined,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const channelIssue = issueFor('channel');
  const textIssue = issueFor('text');

  return (
    <div data-testid="slack-post-message-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Slack connection</span>
        <ConnectionPicker
          provider="slack"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="slack-post-message-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
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
          aria-invalid={channelIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { channel: next })}
        />
        {channelIssue && (
          <p
            data-testid="slack-post-message-channel-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {channelIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={textFieldId} className={labelClass}>
          Message
        </label>
        <textarea
          id={textFieldId}
          value={text}
          rows={4}
          placeholder="Hello {{trigger.user}}!"
          aria-invalid={textIssue !== null}
          onChange={(e) => updateNodeConfig(nodeId, { text: e.target.value })}
          className={cn(inputClass, 'font-mono text-xs')}
        />
        {textIssue && (
          <p
            data-testid="slack-post-message-text-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {textIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={threadId} className={labelClass}>
          Thread timestamp (optional)
        </label>
        <DataPillInput
          id={threadId}
          nodeId={nodeId}
          value={threadTs}
          placeholder="1717000000.000100"
          onChange={(next) => updateNodeConfig(nodeId, { threadTs: next || undefined })}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id={mockId}
          type="checkbox"
          checked={mockOnDryRun}
          onChange={(e) => updateNodeConfig(nodeId, { mockOnDryRun: e.target.checked })}
          className="h-4 w-4 rounded border-white/10 bg-elevated text-accent-teal focus:ring-accent-teal"
        />
        <label htmlFor={mockId} className="text-xs text-text-secondary">
          Skip Slack call on test runs (return mocked output)
        </label>
      </div>
    </div>
  );
}
