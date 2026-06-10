import { useId } from 'react';
import { slackReactionAddedConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function SlackReactionAddedForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const channelId = asString(config.channelId);
  const emoji = asString(config.emoji);

  const channelInputId = useId();
  const emojiInputId = useId();

  const parsed = slackReactionAddedConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    channelId: channelId || undefined,
    emoji: emoji || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');

  return (
    <div data-testid="slack-reaction-added-form" className="flex flex-col gap-4">
      <p className="rounded-md border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">
        Slack triggers require the App signing secret to be added to the connection on the
        Connections page before activating the workflow.
      </p>

      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Slack connection</span>
        <ConnectionPicker
          provider="slack"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="slack-reaction-added-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Slack connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={channelInputId} className={labelClass}>
          Channel ID filter (optional)
        </label>
        <DataPillInput
          id={channelInputId}
          nodeId={nodeId}
          value={channelId}
          placeholder="C0123ABCDEF"
          onChange={(next) => updateNodeConfig(nodeId, { channelId: next || undefined })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={emojiInputId} className={labelClass}>
          Emoji filter (optional, name without colons)
        </label>
        <DataPillInput
          id={emojiInputId}
          nodeId={nodeId}
          value={emoji}
          placeholder="thumbsup"
          onChange={(next) => updateNodeConfig(nodeId, { emoji: next || undefined })}
        />
      </div>
    </div>
  );
}
