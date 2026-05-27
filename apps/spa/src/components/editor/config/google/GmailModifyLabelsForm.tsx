import { useId } from 'react';
import { gmailModifyLabelsConfigSchema } from '@tietide/shared';
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
const checkboxClass =
  'h-4 w-4 rounded border-white/10 bg-elevated text-accent-teal focus:ring-accent-teal';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');
const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

// Comma-separated text <-> string[]; empty list becomes undefined so the
// optional field is omitted from the config rather than stored as [].
const parseList = (raw: string): string[] | undefined => {
  const items = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
};

export function GmailModifyLabelsForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const messageId = asString(config.messageId);
  const addLabelIds = asStringArray(config.addLabelIds);
  const removeLabelIds = asStringArray(config.removeLabelIds);
  const archive = config.archive === true;
  const markRead = config.markRead === true;
  const markUnread = config.markUnread === true;
  const mockOnDryRun = config.mockOnDryRun === true;

  const messageIdField = useId();
  const addField = useId();
  const removeField = useId();
  const archiveId = useId();
  const readId = useId();
  const unreadId = useId();
  const mockId = useId();

  const parsed = gmailModifyLabelsConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    messageId,
    addLabelIds: addLabelIds.length ? addLabelIds : undefined,
    removeLabelIds: removeLabelIds.length ? removeLabelIds : undefined,
    archive: archive || undefined,
    markRead: markRead || undefined,
    markUnread: markUnread || undefined,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);
  const connectionIssue = issueFor('connectionId');
  const messageIdIssue = issueFor('messageId');
  const addIssue = issueFor('addLabelIds');
  const unreadIssue = issueFor('markUnread');

  return (
    <div data-testid="gmail-modify-labels-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Connection</span>
        <ConnectionPicker
          provider="google"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connectionIssue && (
          <p role="alert" className="text-xs text-red-400">
            Select a Google connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={messageIdField} className={labelClass}>
          Message ID
        </label>
        <DataPillInput
          id={messageIdField}
          nodeId={nodeId}
          value={messageId}
          placeholder="{{trigger.message.id}}"
          aria-invalid={messageIdIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { messageId: next })}
        />
        {messageIdIssue && (
          <p role="alert" className="text-xs text-red-400">
            {messageIdIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={addField} className={labelClass}>
          Add label IDs (comma-separated)
        </label>
        <input
          id={addField}
          type="text"
          value={addLabelIds.join(', ')}
          placeholder="STARRED, Label_12"
          onChange={(e) => updateNodeConfig(nodeId, { addLabelIds: parseList(e.target.value) })}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={removeField} className={labelClass}>
          Remove label IDs (comma-separated)
        </label>
        <input
          id={removeField}
          type="text"
          value={removeLabelIds.join(', ')}
          placeholder="SPAM"
          onChange={(e) => updateNodeConfig(nodeId, { removeLabelIds: parseList(e.target.value) })}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2">
          <input
            id={archiveId}
            type="checkbox"
            checked={archive}
            onChange={(e) => updateNodeConfig(nodeId, { archive: e.target.checked })}
            className={checkboxClass}
          />
          <span className="text-xs text-text-secondary">Archive (remove from INBOX)</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            id={readId}
            type="checkbox"
            checked={markRead}
            onChange={(e) => updateNodeConfig(nodeId, { markRead: e.target.checked })}
            className={checkboxClass}
          />
          <span className="text-xs text-text-secondary">Mark as read</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            id={unreadId}
            type="checkbox"
            checked={markUnread}
            onChange={(e) => updateNodeConfig(nodeId, { markUnread: e.target.checked })}
            className={checkboxClass}
          />
          <span className="text-xs text-text-secondary">Mark as unread</span>
        </label>
        {(addIssue || unreadIssue) && (
          <p role="alert" className="text-xs text-red-400">
            {unreadIssue ?? addIssue}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          id={mockId}
          type="checkbox"
          checked={mockOnDryRun}
          onChange={(e) => updateNodeConfig(nodeId, { mockOnDryRun: e.target.checked })}
          className={checkboxClass}
        />
        <label htmlFor={mockId} className="text-xs text-text-secondary">
          Skip Gmail call on test runs (return mocked output)
        </label>
      </div>
    </div>
  );
}
