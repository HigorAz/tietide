import { useId } from 'react';
import { excelRowAddedConfigSchema } from '@tietide/shared';
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
const asNumber = (v: unknown): number | undefined => {
  if (typeof v !== 'number') return undefined;
  return Number.isFinite(v) ? v : undefined;
};

export function ExcelRowAddedForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const workbookId = asString(config.workbookId);
  const worksheet = asString(config.worksheet);
  const tableName = asString(config.tableName);
  const intervalSeconds = asNumber(config.intervalSeconds);

  const workbookFieldId = useId();
  const worksheetFieldId = useId();
  const tableFieldId = useId();
  const intervalFieldId = useId();

  const parsed = excelRowAddedConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    workbookId,
    worksheet,
    tableName: tableName || undefined,
    intervalSeconds,
  });
  const issueFor = (f: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === f)?.message ?? null);

  return (
    <div data-testid="excel-row-added-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Connection</span>
        <ConnectionPicker
          provider="microsoft"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {issueFor('connectionId') && (
          <p
            data-testid="excel-row-added-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Microsoft connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={workbookFieldId} className={labelClass}>
          Workbook (drive item) ID
        </label>
        <input
          id={workbookFieldId}
          type="text"
          value={workbookId}
          onChange={(e) => updateNodeConfig(nodeId, { workbookId: e.target.value })}
          placeholder="01ABCDEF..."
          className={inputClass}
        />
        {issueFor('workbookId') && (
          <p
            data-testid="excel-row-added-workbook-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {issueFor('workbookId')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={worksheetFieldId} className={labelClass}>
          Worksheet name
        </label>
        <input
          id={worksheetFieldId}
          type="text"
          value={worksheet}
          onChange={(e) => updateNodeConfig(nodeId, { worksheet: e.target.value })}
          placeholder="Sheet1"
          className={inputClass}
        />
        {issueFor('worksheet') && (
          <p
            data-testid="excel-row-added-worksheet-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {issueFor('worksheet')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={tableFieldId} className={labelClass}>
          Table name (default: Table1)
        </label>
        <input
          id={tableFieldId}
          type="text"
          value={tableName}
          onChange={(e) => updateNodeConfig(nodeId, { tableName: e.target.value || undefined })}
          placeholder="Table1"
          className={inputClass}
        />
        <p className="text-xs text-text-muted">
          The worksheet must contain a real Excel Table object (Insert &rarr; Table). Raw row ranges
          are not pollable via Microsoft Graph.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={intervalFieldId} className={labelClass}>
          Poll interval (seconds, optional)
        </label>
        <input
          id={intervalFieldId}
          type="number"
          min={1}
          max={3600}
          value={intervalSeconds ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              updateNodeConfig(nodeId, { intervalSeconds: undefined });
              return;
            }
            const n = Number.parseInt(raw, 10);
            updateNodeConfig(nodeId, { intervalSeconds: Number.isFinite(n) ? n : undefined });
          }}
          placeholder="300"
          className={inputClass}
        />
        {issueFor('intervalSeconds') && (
          <p
            data-testid="excel-row-added-interval-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {issueFor('intervalSeconds')}
          </p>
        )}
      </div>
    </div>
  );
}
