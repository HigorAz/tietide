import { useId } from 'react';
import { twilioGetMessageConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function TwilioGetMessageForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const messageSid = asString(config.messageSid);

  const sidId = useId();

  const parsed = twilioGetMessageConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    messageSid,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  return (
    <div data-testid="twilio-get-message-form" className="flex flex-col gap-4">
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
        <label htmlFor={sidId} className={labelClass}>
          Message SID
        </label>
        <DataPillInput
          id={sidId}
          nodeId={nodeId}
          value={messageSid}
          placeholder="SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          aria-invalid={issueFor('messageSid') !== null}
          onChange={(next) => updateNodeConfig(nodeId, { messageSid: next })}
        />
        {issueFor('messageSid') && (
          <p role="alert" className="text-xs text-red-400">
            {issueFor('messageSid')}
          </p>
        )}
      </div>
    </div>
  );
}
