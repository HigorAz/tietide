import { useId } from 'react';
import { sheetsRowAddedConfigSchema } from '@tietide/shared';
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
const asPositiveInt = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : undefined;

export function SheetsRowAddedForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const spreadsheetId = asString(config.spreadsheetId);
  const range = asString(config.range);
  const intervalSeconds = asPositiveInt(config.intervalSeconds);

  const idId = useId();
  const rangeId = useId();
  const intervalId = useId();

  const parsed = sheetsRowAddedConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    spreadsheetId,
    range,
    intervalSeconds,
  });
  const issueFor = (f: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === f)?.message ?? null);

  return (
    <div data-testid="sheets-row-added-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Connection</span>
        <ConnectionPicker
          provider="google"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {issueFor('connectionId') && (
          <p
            data-testid="sheets-row-added-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Google connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={idId} className={labelClass}>
          Spreadsheet ID
        </label>
        <DataPillInput
          id={idId}
          nodeId={nodeId}
          value={spreadsheetId}
          placeholder="1AbCdEfGhI..."
          onChange={(next) => updateNodeConfig(nodeId, { spreadsheetId: next })}
        />
        {issueFor('spreadsheetId') && (
          <p data-testid="sheets-row-added-id-error" role="alert" className="text-xs text-red-400">
            {issueFor('spreadsheetId')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={rangeId} className={labelClass}>
          Range (A1 notation)
        </label>
        <input
          id={rangeId}
          type="text"
          value={range}
          onChange={(e) => updateNodeConfig(nodeId, { range: e.target.value })}
          placeholder="Sheet1!A:Z"
          className={inputClass}
        />
        {issueFor('range') && (
          <p
            data-testid="sheets-row-added-range-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {issueFor('range')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={intervalId} className={labelClass}>
          Poll interval (seconds, optional)
        </label>
        <input
          id={intervalId}
          type="number"
          min={1}
          max={3600}
          value={intervalSeconds ?? ''}
          onChange={(e) => {
            const n = e.target.value === '' ? undefined : Number(e.target.value);
            updateNodeConfig(nodeId, { intervalSeconds: n });
          }}
          placeholder="300"
          className={inputClass}
        />
      </div>
    </div>
  );
}
