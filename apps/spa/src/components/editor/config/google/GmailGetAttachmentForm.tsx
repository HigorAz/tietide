import { useId } from 'react';
import { gmailGetAttachmentConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function GmailGetAttachmentForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const messageId = asString(config.messageId);
  const attachmentId = asString(config.attachmentId);
  const filename = asString(config.filename);
  const mimeType = asString(config.mimeType);
  const mockOnDryRun = config.mockOnDryRun === true;

  const messageIdField = useId();
  const attachmentIdField = useId();
  const filenameField = useId();
  const mimeTypeField = useId();
  const mockId = useId();

  const parsed = gmailGetAttachmentConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    messageId,
    attachmentId,
    filename: filename || undefined,
    mimeType: mimeType || undefined,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);
  const connectionIssue = issueFor('connectionId');
  const messageIdIssue = issueFor('messageId');
  const attachmentIdIssue = issueFor('attachmentId');

  return (
    <div data-testid="gmail-get-attachment-form" className="flex flex-col gap-4">
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
        <label htmlFor={attachmentIdField} className={labelClass}>
          Attachment ID
        </label>
        <DataPillInput
          id={attachmentIdField}
          nodeId={nodeId}
          value={attachmentId}
          placeholder="{{steps.getMessage.attachments[0].attachmentId}}"
          aria-invalid={attachmentIdIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { attachmentId: next })}
        />
        {attachmentIdIssue && (
          <p role="alert" className="text-xs text-red-400">
            {attachmentIdIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={filenameField} className={labelClass}>
          Filename (optional)
        </label>
        <DataPillInput
          id={filenameField}
          nodeId={nodeId}
          value={filename}
          placeholder="invoice.pdf"
          onChange={(next) => updateNodeConfig(nodeId, { filename: next || undefined })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={mimeTypeField} className={labelClass}>
          MIME type (optional)
        </label>
        <DataPillInput
          id={mimeTypeField}
          nodeId={nodeId}
          value={mimeType}
          placeholder="application/pdf"
          onChange={(next) => updateNodeConfig(nodeId, { mimeType: next || undefined })}
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
          Skip Gmail call on test runs (return mocked output)
        </label>
      </div>
    </div>
  );
}
