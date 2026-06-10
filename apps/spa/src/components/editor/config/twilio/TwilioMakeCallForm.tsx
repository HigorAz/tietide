import { useId } from 'react';
import { twilioMakeCallConfigSchema } from '@tietide/shared';
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

export function TwilioMakeCallForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const to = asString(config.to);
  const from = asString(config.from);
  const url = asString(config.url);
  const twiml = asString(config.twiml);
  // 'url' unless the user has typed inline TwiML.
  const mode = twiml && !url ? 'twiml' : 'url';

  const toId = useId();
  const fromId = useId();
  const modeId = useId();
  const sourceId = useId();

  const parsed = twilioMakeCallConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    to,
    from,
    url: url || undefined,
    twiml: twiml || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);
  const formError = parsed.success
    ? null
    : (parsed.error.issues.find((i) => i.path.length === 0)?.message ?? null);

  const switchMode = (next: string): void => {
    // Keep exactly one of url/twiml set so the refine passes.
    if (next === 'url') updateNodeConfig(nodeId, { twiml: undefined });
    else updateNodeConfig(nodeId, { url: undefined });
  };

  return (
    <div data-testid="twilio-make-call-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Twilio connection</span>
        <ConnectionPicker
          provider="twilio"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {issueFor('connectionId') && (
          <p role="alert" className="text-xs text-red-400">
            Select a Twilio connection.
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
          placeholder="+14155551212"
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
        <label htmlFor={fromId} className={labelClass}>
          From (E.164 Twilio number)
        </label>
        <DataPillInput
          id={fromId}
          nodeId={nodeId}
          value={from}
          placeholder="+15558675309"
          aria-invalid={issueFor('from') !== null}
          onChange={(next) => updateNodeConfig(nodeId, { from: next })}
        />
        {issueFor('from') && (
          <p role="alert" className="text-xs text-red-400">
            {issueFor('from')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={modeId} className={labelClass}>
          Instructions
        </label>
        <select
          id={modeId}
          value={mode}
          onChange={(e) => switchMode(e.target.value)}
          className={inputClass}
        >
          <option value="url">TwiML URL</option>
          <option value="twiml">Inline TwiML</option>
        </select>
      </div>

      {mode === 'url' ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={sourceId} className={labelClass}>
            TwiML URL
          </label>
          <DataPillInput
            id={sourceId}
            nodeId={nodeId}
            value={url}
            placeholder="https://example.com/voice.xml"
            onChange={(next) => updateNodeConfig(nodeId, { url: next || undefined })}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={sourceId} className={labelClass}>
            Inline TwiML
          </label>
          <DataPillInput
            id={sourceId}
            nodeId={nodeId}
            value={twiml}
            placeholder="<Response><Say>Hello</Say></Response>"
            onChange={(next) => updateNodeConfig(nodeId, { twiml: next || undefined })}
          />
        </div>
      )}

      {formError && (
        <p role="alert" className="text-xs text-red-400">
          {formError}
        </p>
      )}
    </div>
  );
}
