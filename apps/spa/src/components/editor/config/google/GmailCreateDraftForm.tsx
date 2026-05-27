import { useId } from 'react';
import { gmailCreateDraftConfigSchema } from '@tietide/shared';
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

export function GmailCreateDraftForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const to = asString(config.to);
  const subject = asString(config.subject);
  const body = asString(config.body);
  const cc = asString(config.cc);
  const bcc = asString(config.bcc);
  const threadId = asString(config.threadId);
  const mockOnDryRun = config.mockOnDryRun === true;

  const toField = useId();
  const subjectField = useId();
  const bodyField = useId();
  const ccField = useId();
  const bccField = useId();
  const threadField = useId();
  const mockId = useId();

  const parsed = gmailCreateDraftConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    to,
    subject,
    body,
    cc: cc || undefined,
    bcc: bcc || undefined,
    threadId: threadId || undefined,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);
  const connectionIssue = issueFor('connectionId');
  const toIssue = issueFor('to');
  const subjectIssue = issueFor('subject');
  const bodyIssue = issueFor('body');

  return (
    <div data-testid="gmail-create-draft-form" className="flex flex-col gap-4">
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
        <label htmlFor={toField} className={labelClass}>
          To
        </label>
        <DataPillInput
          id={toField}
          nodeId={nodeId}
          value={to}
          placeholder="recipient@example.com"
          aria-invalid={toIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { to: next })}
        />
        {toIssue && (
          <p role="alert" className="text-xs text-red-400">
            {toIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={subjectField} className={labelClass}>
          Subject
        </label>
        <DataPillInput
          id={subjectField}
          nodeId={nodeId}
          value={subject}
          placeholder="Re: your request"
          aria-invalid={subjectIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { subject: next })}
        />
        {subjectIssue && (
          <p role="alert" className="text-xs text-red-400">
            {subjectIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={bodyField} className={labelClass}>
          Body
        </label>
        <textarea
          id={bodyField}
          value={body}
          rows={6}
          placeholder="Draft message body"
          aria-invalid={bodyIssue !== null}
          onChange={(e) => updateNodeConfig(nodeId, { body: e.target.value })}
          className={inputClass}
        />
        {bodyIssue && (
          <p role="alert" className="text-xs text-red-400">
            {bodyIssue}
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
          onChange={(next) => updateNodeConfig(nodeId, { cc: next || undefined })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={bccField} className={labelClass}>
          Bcc (optional)
        </label>
        <DataPillInput
          id={bccField}
          nodeId={nodeId}
          value={bcc}
          placeholder="bcc@example.com"
          onChange={(next) => updateNodeConfig(nodeId, { bcc: next || undefined })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={threadField} className={labelClass}>
          Thread ID (optional — drafts a reply)
        </label>
        <DataPillInput
          id={threadField}
          nodeId={nodeId}
          value={threadId}
          placeholder="{{trigger.message.threadId}}"
          onChange={(next) => updateNodeConfig(nodeId, { threadId: next || undefined })}
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
