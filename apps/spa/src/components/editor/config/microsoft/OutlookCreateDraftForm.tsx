import { useId } from 'react';
import { outlookCreateDraftConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function OutlookCreateDraftForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const replyToMessageId = asString(config.replyToMessageId);
  const to = asString(config.to);
  const cc = asString(config.cc);
  const subject = asString(config.subject);
  const body = asString(config.body);
  const isHtml = config.isHtml === true;
  const mockOnDryRun = config.mockOnDryRun === true;

  const replyField = useId();
  const toField = useId();
  const ccField = useId();
  const subjectField = useId();
  const bodyField = useId();
  const htmlId = useId();
  const mockId = useId();

  const isReply = replyToMessageId.trim().length > 0;

  const parsed = outlookCreateDraftConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    replyToMessageId: replyToMessageId || undefined,
    to: to || undefined,
    cc: cc || undefined,
    subject: subject || undefined,
    body,
    isHtml: isHtml || undefined,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  return (
    <div data-testid="outlook-create-draft-form" className="flex flex-col gap-4">
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
        <label htmlFor={replyField} className={labelClass}>
          Reply to message ID (optional)
        </label>
        <DataPillInput
          id={replyField}
          nodeId={nodeId}
          value={replyToMessageId}
          placeholder="Leave empty for a new draft"
          onChange={(next) => updateNodeConfig(nodeId, { replyToMessageId: next })}
        />
        <p className="text-xs text-text-muted">
          When set, a reply draft is created and the body is used as the reply comment.
        </p>
      </div>

      {!isReply && (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={toField} className={labelClass}>
              To
            </label>
            <DataPillInput
              id={toField}
              nodeId={nodeId}
              value={to}
              placeholder="recipient@example.com, other@example.com"
              aria-invalid={issueFor('to') !== null}
              onChange={(next) => updateNodeConfig(nodeId, { to: next })}
            />
            {issueFor('to') && (
              <p role="alert" className="text-xs text-red-400">
                {issueFor('to')}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={ccField} className={labelClass}>
              Cc (optional)
            </label>
            <DataPillInput
              id={ccField}
              nodeId={nodeId}
              value={cc}
              placeholder="cc@example.com"
              onChange={(next) => updateNodeConfig(nodeId, { cc: next })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={subjectField} className={labelClass}>
              Subject
            </label>
            <DataPillInput
              id={subjectField}
              nodeId={nodeId}
              value={subject}
              placeholder="Subject line"
              aria-invalid={issueFor('subject') !== null}
              onChange={(next) => updateNodeConfig(nodeId, { subject: next })}
            />
          </div>
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={bodyField} className={labelClass}>
          Body
        </label>
        <DataPillInput
          id={bodyField}
          nodeId={nodeId}
          value={body}
          aria-invalid={issueFor('body') !== null}
          onChange={(next) => updateNodeConfig(nodeId, { body: next })}
        />
        {issueFor('body') && (
          <p role="alert" className="text-xs text-red-400">
            {issueFor('body')}
          </p>
        )}
      </div>

      {!isReply && (
        <div className="flex items-center gap-2">
          <input
            id={htmlId}
            type="checkbox"
            checked={isHtml}
            onChange={(e) => updateNodeConfig(nodeId, { isHtml: e.target.checked })}
            className="h-4 w-4 rounded border-white/10 bg-elevated text-accent-teal focus:ring-accent-teal"
          />
          <label htmlFor={htmlId} className="text-xs text-text-secondary">
            Body is HTML
          </label>
        </div>
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
