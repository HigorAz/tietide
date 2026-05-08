import { useId } from 'react';
import { twilioSendWhatsAppConfigSchema } from '@tietide/shared';
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
const asRecord = (v: unknown): Record<string, string> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {};

export function TwilioSendWhatsAppForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const from = asString(config.from);
  const to = asString(config.to);
  const contentSid = asString(config.contentSid);
  const contentVariables = asRecord(config.contentVariables);
  const variablesText = JSON.stringify(contentVariables, null, 2);

  const fromId = useId();
  const toId = useId();
  const sidId = useId();
  const varsId = useId();

  const parsedVars: Record<string, string> | null = contentVariables;
  let varsParseError: string | null = null;
  // No-op — already parsed from config.

  const parsed = twilioSendWhatsAppConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    from,
    to,
    contentSid,
    contentVariables: parsedVars && Object.keys(parsedVars).length > 0 ? parsedVars : undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const fromIssue = issueFor('from');
  const toIssue = issueFor('to');
  const sidIssue = issueFor('contentSid');

  const handleVarsChange = (text: string) => {
    if (text.trim() === '') {
      updateNodeConfig(nodeId, { contentVariables: undefined });
      return;
    }
    try {
      const next = JSON.parse(text) as unknown;
      if (next && typeof next === 'object' && !Array.isArray(next)) {
        updateNodeConfig(nodeId, { contentVariables: next });
        varsParseError = null;
      }
    } catch {
      varsParseError = 'Variables must be valid JSON';
    }
  };

  return (
    <div data-testid="twilio-send-whatsapp-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Twilio connection</span>
        <ConnectionPicker
          provider="twilio"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="twilio-send-whatsapp-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Twilio connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={fromId} className={labelClass}>
          From (whatsapp:+E.164)
        </label>
        <DataPillInput
          id={fromId}
          nodeId={nodeId}
          value={from}
          placeholder="whatsapp:+14155238886"
          aria-invalid={fromIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { from: next })}
        />
        {fromIssue && (
          <p
            data-testid="twilio-send-whatsapp-from-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {fromIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={toId} className={labelClass}>
          To (whatsapp:+E.164)
        </label>
        <DataPillInput
          id={toId}
          nodeId={nodeId}
          value={to}
          placeholder="whatsapp:+14155551313"
          aria-invalid={toIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { to: next })}
        />
        {toIssue && (
          <p
            data-testid="twilio-send-whatsapp-to-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {toIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={sidId} className={labelClass}>
          Content template SID
        </label>
        <DataPillInput
          id={sidId}
          nodeId={nodeId}
          value={contentSid}
          placeholder="HX-fakefakefakefakefakefakefakefak"
          aria-invalid={sidIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { contentSid: next })}
        />
        {sidIssue && (
          <p
            data-testid="twilio-send-whatsapp-sid-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {sidIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={varsId} className={labelClass}>
          Template variables (JSON object)
        </label>
        <textarea
          id={varsId}
          defaultValue={variablesText === '{}' ? '' : variablesText}
          rows={3}
          placeholder='{"1":"{{trigger.name}}","2":"{{trigger.code}}"}'
          onChange={(e) => handleVarsChange(e.target.value)}
          className={cn(inputClass, 'font-mono text-xs')}
        />
        {varsParseError && (
          <p
            data-testid="twilio-send-whatsapp-vars-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {varsParseError}
          </p>
        )}
      </div>
    </div>
  );
}
