import { useId } from 'react';
import { twilioSendSmsConfigSchema } from '@tietide/shared';
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

export function TwilioSendSmsForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const from = asString(config.from);
  const to = asString(config.to);
  const body = asString(config.body);
  const mockOnDryRun = config.mockOnDryRun === true;

  const fromId = useId();
  const toId = useId();
  const bodyId = useId();
  const mockId = useId();

  const parsed = twilioSendSmsConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    from,
    to,
    body,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const fromIssue = issueFor('from');
  const toIssue = issueFor('to');
  const bodyIssue = issueFor('body');

  return (
    <div data-testid="twilio-send-sms-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Twilio connection</span>
        <ConnectionPicker
          provider="twilio"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="twilio-send-sms-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Twilio connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={fromId} className={labelClass}>
          From (E.164)
        </label>
        <DataPillInput
          id={fromId}
          nodeId={nodeId}
          value={from}
          placeholder="+14155551212"
          aria-invalid={fromIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { from: next })}
        />
        {fromIssue && (
          <p data-testid="twilio-send-sms-from-error" role="alert" className="text-xs text-red-400">
            {fromIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={toId} className={labelClass}>
          To (E.164)
        </label>
        <DataPillInput
          id={toId}
          nodeId={nodeId}
          value={to}
          placeholder="+14155551313"
          aria-invalid={toIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { to: next })}
        />
        {toIssue && (
          <p data-testid="twilio-send-sms-to-error" role="alert" className="text-xs text-red-400">
            {toIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={bodyId} className={labelClass}>
          Body
        </label>
        <textarea
          id={bodyId}
          value={body}
          rows={4}
          aria-invalid={bodyIssue !== null}
          onChange={(e) => updateNodeConfig(nodeId, { body: e.target.value })}
          className={cn(inputClass, 'font-mono text-xs')}
        />
        {bodyIssue && (
          <p data-testid="twilio-send-sms-body-error" role="alert" className="text-xs text-red-400">
            {bodyIssue}
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
          Skip Twilio call on test runs
        </label>
      </div>
    </div>
  );
}
