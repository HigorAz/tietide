import { useId } from 'react';
import { gmailGetMessageConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function GmailGetMessageForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const messageId = asString(config.messageId);
  const mockOnDryRun = config.mockOnDryRun === true;

  const messageIdField = useId();
  const mockId = useId();

  const parsed = gmailGetMessageConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    messageId,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);
  const connectionIssue = issueFor('connectionId');
  const messageIdIssue = issueFor('messageId');

  return (
    <div data-testid="gmail-get-message-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Connection</span>
        <ConnectionPicker
          provider="google"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connectionIssue && (
          <p
            data-testid="gmail-get-message-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
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
          <p data-testid="gmail-get-message-id-error" role="alert" className="text-xs text-red-400">
            {messageIdIssue}
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
          Skip Gmail call on test runs (return mocked output)
        </label>
      </div>
    </div>
  );
}
