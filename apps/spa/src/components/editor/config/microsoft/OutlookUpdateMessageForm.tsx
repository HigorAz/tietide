import { useId } from 'react';
import { outlookUpdateMessageConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const inputClass =
  'w-full rounded-md border border-white/10 bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

const FLAG_OPTIONS = ['', 'flagged', 'complete', 'notFlagged'] as const;

export function OutlookUpdateMessageForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const messageId = asString(config.messageId);
  const flagStatus = asString(config.flagStatus);
  const categories = asString(config.categories);
  const moveToFolderId = asString(config.moveToFolderId);
  const markRead = config.markRead === true;
  const markUnread = config.markUnread === true;
  const mockOnDryRun = config.mockOnDryRun === true;

  const messageIdField = useId();
  const flagField = useId();
  const categoriesField = useId();
  const moveField = useId();
  const readId = useId();
  const unreadId = useId();
  const mockId = useId();

  const categoriesArray = categories
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  const parsed = outlookUpdateMessageConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    messageId,
    flagStatus: flagStatus || undefined,
    categories: categoriesArray.length > 0 ? categoriesArray : undefined,
    markRead: markRead || undefined,
    markUnread: markUnread || undefined,
    moveToFolderId: moveToFolderId || undefined,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  return (
    <div data-testid="outlook-update-message-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Connection</span>
        <ConnectionPicker
          provider="microsoft"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {issueFor('connectionId') && (
          <p role="alert" className="text-xs text-red-400">
            Select a Microsoft connection.
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
          aria-invalid={issueFor('messageId') !== null}
          onChange={(next) => updateNodeConfig(nodeId, { messageId: next })}
        />
        {issueFor('messageId') && (
          <p role="alert" className="text-xs text-red-400">
            {issueFor('messageId')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={flagField} className={labelClass}>
          Flag
        </label>
        <select
          id={flagField}
          value={flagStatus}
          className={inputClass}
          onChange={(e) => updateNodeConfig(nodeId, { flagStatus: e.target.value })}
        >
          {FLAG_OPTIONS.map((opt) => (
            <option key={opt || 'none'} value={opt}>
              {opt === '' ? '— no change —' : opt}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={categoriesField} className={labelClass}>
          Categories (comma-separated)
        </label>
        <DataPillInput
          id={categoriesField}
          nodeId={nodeId}
          value={categories}
          placeholder="Red category, Follow up"
          onChange={(next) => updateNodeConfig(nodeId, { categories: next })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={moveField} className={labelClass}>
          Move to folder ID
        </label>
        <DataPillInput
          id={moveField}
          nodeId={nodeId}
          value={moveToFolderId}
          placeholder="archive"
          onChange={(next) => updateNodeConfig(nodeId, { moveToFolderId: next })}
        />
      </div>

      <div className="flex items-center gap-4">
        <label htmlFor={readId} className="flex items-center gap-2 text-xs text-text-secondary">
          <input
            id={readId}
            type="checkbox"
            checked={markRead}
            onChange={(e) =>
              updateNodeConfig(nodeId, { markRead: e.target.checked, markUnread: false })
            }
            className="h-4 w-4 rounded border-white/10 bg-elevated text-accent-teal focus:ring-accent-teal"
          />
          Mark read
        </label>
        <label htmlFor={unreadId} className="flex items-center gap-2 text-xs text-text-secondary">
          <input
            id={unreadId}
            type="checkbox"
            checked={markUnread}
            onChange={(e) =>
              updateNodeConfig(nodeId, { markUnread: e.target.checked, markRead: false })
            }
            className="h-4 w-4 rounded border-white/10 bg-elevated text-accent-teal focus:ring-accent-teal"
          />
          Mark unread
        </label>
      </div>

      {issueFor('flagStatus') && (
        <p role="alert" className="text-xs text-red-400">
          {issueFor('flagStatus')}
        </p>
      )}
      {issueFor('markUnread') && (
        <p role="alert" className="text-xs text-red-400">
          {issueFor('markUnread')}
        </p>
      )}

      <div className="flex items-center gap-2">
        <input
          id={mockId}
          type="checkbox"
          checked={mockOnDryRun}
          onChange={(e) => updateNodeConfig(nodeId, { mockOnDryRun: e.target.checked })}
          className="h-4 w-4 rounded border-white/10 bg-elevated text-accent-teal focus:ring-accent-teal"
        />
        <label htmlFor={mockId} className="text-xs text-text-secondary">
          Skip Outlook call on test runs (return mocked output)
        </label>
      </div>
    </div>
  );
}
