import { useId } from 'react';
import { outlookSendConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function OutlookSendForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const to = asString(config.to);
  const subject = asString(config.subject);
  const body = asString(config.body);
  const cc = asString(config.cc);
  const bcc = asString(config.bcc);
  const isHtml = config.isHtml === true;
  const mockOnDryRun = config.mockOnDryRun === true;

  const toId = useId();
  const subjectId = useId();
  const bodyId = useId();
  const ccId = useId();
  const bccId = useId();
  const htmlId = useId();
  const mockId = useId();

  const parsed = outlookSendConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    to,
    subject,
    body,
    cc: cc || undefined,
    bcc: bcc || undefined,
    isHtml: isHtml || undefined,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (f: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === f)?.message ?? null);

  const connectionIssue = issueFor('connectionId');
  const toIssue = issueFor('to');
  const subjectIssue = issueFor('subject');
  const bodyIssue = issueFor('body');
  const ccIssue = issueFor('cc');
  const bccIssue = issueFor('bcc');

  return (
    <div data-testid="outlook-send-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Connection</span>
        <ConnectionPicker
          provider="microsoft"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connectionIssue && (
          <p
            data-testid="outlook-send-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Microsoft connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={toId} className={labelClass}>
          To
        </label>
        <DataPillInput
          id={toId}
          nodeId={nodeId}
          value={to}
          placeholder="recipient@example.com"
          aria-invalid={toIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { to: next })}
        />
        {toIssue && (
          <p data-testid="outlook-send-to-error" role="alert" className="text-xs text-red-400">
            {toIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={subjectId} className={labelClass}>
          Subject
        </label>
        <DataPillInput
          id={subjectId}
          nodeId={nodeId}
          value={subject}
          placeholder="Order #{{trigger.id}}"
          aria-invalid={subjectIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { subject: next })}
        />
        {subjectIssue && (
          <p data-testid="outlook-send-subject-error" role="alert" className="text-xs text-red-400">
            {subjectIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={bodyId} className={labelClass}>
          Body
        </label>
        <DataPillInput
          id={bodyId}
          nodeId={nodeId}
          value={body}
          aria-invalid={bodyIssue !== null}
          placeholder="Hi {{trigger.name}}, …"
          onChange={(next) => updateNodeConfig(nodeId, { body: next })}
        />
        {bodyIssue && (
          <p data-testid="outlook-send-body-error" role="alert" className="text-xs text-red-400">
            {bodyIssue}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          id={htmlId}
          type="checkbox"
          checked={isHtml}
          onChange={(e) => updateNodeConfig(nodeId, { isHtml: e.target.checked })}
          className="h-4 w-4 rounded border-white/10 bg-elevated text-accent-teal focus:ring-accent-teal"
        />
        <label htmlFor={htmlId} className="text-xs text-text-secondary">
          Body is HTML (default: plain text)
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ccId} className={labelClass}>
          Cc (optional, comma-separated)
        </label>
        <DataPillInput
          id={ccId}
          nodeId={nodeId}
          value={cc}
          placeholder="cc@example.com"
          onChange={(next) => updateNodeConfig(nodeId, { cc: next || undefined })}
        />
        {ccIssue && (
          <p data-testid="outlook-send-cc-error" role="alert" className="text-xs text-red-400">
            {ccIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={bccId} className={labelClass}>
          Bcc (optional, comma-separated)
        </label>
        <DataPillInput
          id={bccId}
          nodeId={nodeId}
          value={bcc}
          placeholder="bcc@example.com"
          onChange={(next) => updateNodeConfig(nodeId, { bcc: next || undefined })}
        />
        {bccIssue && (
          <p data-testid="outlook-send-bcc-error" role="alert" className="text-xs text-red-400">
            {bccIssue}
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
          Skip Outlook call on test runs (return mocked output)
        </label>
      </div>
    </div>
  );
}
