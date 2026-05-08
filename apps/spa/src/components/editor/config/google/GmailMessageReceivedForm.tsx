import { useId } from 'react';
import { gmailMessageReceivedConfigSchema } from '@tietide/shared';
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
const asLabelIds = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

export function GmailMessageReceivedForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const topicName = asString(config.topicName);
  const labelIds = asLabelIds(config.labelIds);
  const labelFilterAction = asString(config.labelFilterAction);

  const topicId = useId();
  const labelsId = useId();
  const filterId = useId();

  const parsed = gmailMessageReceivedConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    topicName,
    labelIds: labelIds.length > 0 ? labelIds : undefined,
    labelFilterAction:
      labelFilterAction === 'include' || labelFilterAction === 'exclude'
        ? labelFilterAction
        : undefined,
  });
  const issueFor = (f: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === f)?.message ?? null);

  return (
    <div data-testid="gmail-message-received-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Connection</span>
        <ConnectionPicker
          provider="google"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {issueFor('connectionId') && (
          <p
            data-testid="gmail-message-received-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Google connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={topicId} className={labelClass}>
          Pub/Sub topic name
        </label>
        <input
          id={topicId}
          type="text"
          value={topicName}
          onChange={(e) => updateNodeConfig(nodeId, { topicName: e.target.value })}
          placeholder="projects/my-project/topics/gmail-watch"
          className={inputClass}
        />
        {issueFor('topicName') && (
          <p
            data-testid="gmail-message-received-topic-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {issueFor('topicName')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={labelsId} className={labelClass}>
          Label IDs (comma-separated, optional)
        </label>
        <input
          id={labelsId}
          type="text"
          value={labelIds.join(', ')}
          onChange={(e) => {
            const next = e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            updateNodeConfig(nodeId, { labelIds: next.length > 0 ? next : undefined });
          }}
          placeholder="INBOX, STARRED"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={filterId} className={labelClass}>
          Filter action
        </label>
        <select
          id={filterId}
          value={labelFilterAction}
          onChange={(e) =>
            updateNodeConfig(nodeId, { labelFilterAction: e.target.value || undefined })
          }
          className={inputClass}
        >
          <option value="">Default</option>
          <option value="include">Include only these labels</option>
          <option value="exclude">Exclude these labels</option>
        </select>
      </div>
    </div>
  );
}
