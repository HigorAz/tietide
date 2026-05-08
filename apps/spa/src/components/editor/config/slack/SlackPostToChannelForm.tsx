import { useId } from 'react';
import { slackPostToChannelConfigSchema } from '@tietide/shared';
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

export function SlackPostToChannelForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const channelName = asString(config.channelName);
  const text = asString(config.text);
  const mockOnDryRun = config.mockOnDryRun === true;

  const nameId = useId();
  const textFieldId = useId();
  const mockId = useId();

  const parsed = slackPostToChannelConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    channelName,
    text,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const nameIssue = issueFor('channelName');
  const textIssue = issueFor('text');

  return (
    <div data-testid="slack-post-to-channel-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Slack connection</span>
        <ConnectionPicker
          provider="slack"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="slack-post-to-channel-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Slack connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className={labelClass}>
          Channel name (without #)
        </label>
        <DataPillInput
          id={nameId}
          nodeId={nodeId}
          value={channelName}
          placeholder="general"
          aria-invalid={nameIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { channelName: next })}
        />
        {nameIssue && (
          <p
            data-testid="slack-post-to-channel-name-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {nameIssue}
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
          aria-invalid={textIssue !== null}
          onChange={(e) => updateNodeConfig(nodeId, { text: e.target.value })}
          className={cn(inputClass, 'font-mono text-xs')}
        />
        {textIssue && (
          <p
            data-testid="slack-post-to-channel-text-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {textIssue}
          </p>
        )}
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
          Skip Slack call on test runs
        </label>
      </div>
    </div>
  );
}
