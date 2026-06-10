import { useId } from 'react';
import { slackMessageReceivedConfigSchema, SLACK_MESSAGE_EVENT_TYPES } from '@tietide/shared';
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

export function SlackMessageReceivedForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const channelId = asString(config.channelId);
  const eventType = asString(config.eventType) || 'message.channels';
  const keyword = asString(config.keyword);

  const channelInputId = useId();
  const eventInputId = useId();
  const keywordInputId = useId();

  const parsed = slackMessageReceivedConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    channelId: channelId || undefined,
    eventType,
    keyword: keyword || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const channelIssue = issueFor('channelId');

  return (
    <div data-testid="slack-message-received-form" className="flex flex-col gap-4">
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
            data-testid="slack-message-received-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Slack connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={eventInputId} className={labelClass}>
          Event type
        </label>
        <select
          id={eventInputId}
          value={eventType}
          onChange={(e) => updateNodeConfig(nodeId, { eventType: e.target.value })}
          className={inputClass}
        >
          {SLACK_MESSAGE_EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
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
          aria-invalid={channelIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { channelId: next || undefined })}
        />
        {channelIssue && (
          <p
            data-testid="slack-message-received-channel-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {channelIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={keywordInputId} className={labelClass}>
          Keyword filter (optional)
        </label>
        <DataPillInput
          id={keywordInputId}
          nodeId={nodeId}
          value={keyword}
          placeholder="deploy"
          onChange={(next) => updateNodeConfig(nodeId, { keyword: next || undefined })}
        />
      </div>
    </div>
  );
}
