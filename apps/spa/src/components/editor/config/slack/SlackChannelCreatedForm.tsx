import { slackChannelCreatedConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function SlackChannelCreatedForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);

  const parsed = slackChannelCreatedConfigSchema.safeParse({
    connectionId: connectionId || undefined,
  });
  const connIssue = parsed.success
    ? null
    : (parsed.error.issues.find((i) => i.path[0] === 'connectionId')?.message ?? null);

  return (
    <div data-testid="slack-channel-created-form" className="flex flex-col gap-4">
      <p className="rounded-md border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">
        Slack triggers require the App signing secret on the connection, and the{' '}
        <code>channel_created</code> bot event subscribed in your Slack App, before activating.
      </p>

      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Slack connection</span>
        <ConnectionPicker
          provider="slack"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p role="alert" className="text-xs text-red-400">
            Select a Slack connection.
          </p>
        )}
      </div>
    </div>
  );
}
