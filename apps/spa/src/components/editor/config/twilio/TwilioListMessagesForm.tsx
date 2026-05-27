import { useId } from 'react';
import { twilioListMessagesConfigSchema } from '@tietide/shared';
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

export function TwilioListMessagesForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const to = asString(config.to);
  const from = asString(config.from);
  const pageSize = typeof config.pageSize === 'number' ? config.pageSize : '';

  const toId = useId();
  const fromId = useId();
  const pageSizeId = useId();

  const parsed = twilioListMessagesConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    to: to || undefined,
    from: from || undefined,
    pageSize: typeof config.pageSize === 'number' ? config.pageSize : undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  return (
    <div data-testid="twilio-list-messages-form" className="flex flex-col gap-4">
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
          To (optional, E.164)
        </label>
        <DataPillInput
          id={toId}
          nodeId={nodeId}
          value={to}
          placeholder="+14155551212"
          aria-invalid={issueFor('to') !== null}
          onChange={(next) => updateNodeConfig(nodeId, { to: next || undefined })}
        />
        {issueFor('to') && (
          <p role="alert" className="text-xs text-red-400">
            {issueFor('to')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={fromId} className={labelClass}>
          From (optional, E.164)
        </label>
        <DataPillInput
          id={fromId}
          nodeId={nodeId}
          value={from}
          placeholder="+15558675309"
          aria-invalid={issueFor('from') !== null}
          onChange={(next) => updateNodeConfig(nodeId, { from: next || undefined })}
        />
        {issueFor('from') && (
          <p role="alert" className="text-xs text-red-400">
            {issueFor('from')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={pageSizeId} className={labelClass}>
          Page size (1–1000)
        </label>
        <input
          id={pageSizeId}
          type="number"
          min={1}
          max={1000}
          value={pageSize}
          placeholder="20"
          onChange={(e) =>
            updateNodeConfig(nodeId, {
              pageSize: e.target.value === '' ? undefined : Number(e.target.value),
            })
          }
          className={inputClass}
        />
        {issueFor('pageSize') && (
          <p role="alert" className="text-xs text-red-400">
            {issueFor('pageSize')}
          </p>
        )}
      </div>
    </div>
  );
}
