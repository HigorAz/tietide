import { useId } from 'react';
import { twilioSmsReceivedConfigSchema } from '@tietide/shared';
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

export function TwilioSmsReceivedForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const phoneNumberSid = asString(config.phoneNumberSid);

  const phoneInputId = useId();

  const parsed = twilioSmsReceivedConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    phoneNumberSid,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const phoneIssue = issueFor('phoneNumberSid');

  return (
    <div data-testid="twilio-sms-received-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Twilio connection</span>
        <ConnectionPicker
          provider="twilio"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="twilio-sms-received-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Twilio connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={phoneInputId} className={labelClass}>
          Phone number SID
        </label>
        <input
          id={phoneInputId}
          type="text"
          value={phoneNumberSid}
          placeholder="PN-fakefakefakefakefakefakefakefak"
          aria-invalid={phoneIssue !== null}
          onChange={(e) => updateNodeConfig(nodeId, { phoneNumberSid: e.target.value })}
          className={inputClass}
        />
        {phoneIssue && (
          <p
            data-testid="twilio-sms-received-phone-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {phoneIssue}
          </p>
        )}
      </div>
    </div>
  );
}
