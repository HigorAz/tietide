import { useId } from 'react';
import { slackAppMentionConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function SlackAppMentionForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const channelId = asString(config.channelId);

  const channelInputId = useId();

  const parsed = slackAppMentionConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    channelId: channelId || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  return (
    <div data-testid="slack-app-mention-form" className="flex flex-col gap-4">
      <p className="rounded-md border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">
        Slack triggers require the App signing secret on the connection, and the{' '}
        <code>app_mention</code> bot event subscribed in your Slack App, before activating.
      </p>

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
    </div>
  );
}
