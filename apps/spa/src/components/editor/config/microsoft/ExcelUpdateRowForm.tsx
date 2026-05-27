import { useId } from 'react';
import { excelUpdateRowConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const inputClass =
  'w-full rounded-md border border-white/10 bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function ExcelUpdateRowForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const workbookId = asString(config.workbookId);
  const worksheet = asString(config.worksheet);
  const tableName = asString(config.tableName) || 'Table1';
  const values = asString(config.values);
  const matchByLookup = config.matchByLookup === true;
  const rowIndex = typeof config.rowIndex === 'number' ? String(config.rowIndex) : '';
  const lookupColumn = asString(config.lookupColumn);
  const lookupValue = asString(config.lookupValue);
  const mockOnDryRun = config.mockOnDryRun === true;

  const workbookField = useId();
  const worksheetField = useId();
  const tableField = useId();
  const valuesField = useId();
  const rowIndexField = useId();
  const lookupColumnField = useId();
  const lookupValueField = useId();
  const lookupToggle = useId();
  const mockId = useId();

  const valuesArray = values
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  const parsed = excelUpdateRowConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    workbookId,
    worksheet,
    tableName,
    values: valuesArray.length > 0 ? valuesArray : [],
    rowIndex: matchByLookup || rowIndex === '' ? undefined : Number(rowIndex),
    lookup:
      matchByLookup && lookupColumn ? { column: lookupColumn, value: lookupValue } : undefined,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  return (
    <div data-testid="excel-update-row-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Connection</span>
        <ConnectionPicker
          provider="microsoft"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {issueFor('connectionId') && (
          <p role="alert" className="text-xs text-red-400">
            Select a Microsoft connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={workbookField} className={labelClass}>
          Workbook (drive item) ID
        </label>
        <DataPillInput
          id={workbookField}
          nodeId={nodeId}
          value={workbookId}
          placeholder="01ABC..."
          onChange={(next) => updateNodeConfig(nodeId, { workbookId: next })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={worksheetField} className={labelClass}>
          Worksheet
        </label>
        <DataPillInput
          id={worksheetField}
          nodeId={nodeId}
          value={worksheet}
          placeholder="Sheet1"
          onChange={(next) => updateNodeConfig(nodeId, { worksheet: next })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={tableField} className={labelClass}>
          Table name
        </label>
        <DataPillInput
          id={tableField}
          nodeId={nodeId}
          value={tableName}
          placeholder="Table1"
          onChange={(next) => updateNodeConfig(nodeId, { tableName: next })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={valuesField} className={labelClass}>
          New row values (comma-separated)
        </label>
        <DataPillInput
          id={valuesField}
          nodeId={nodeId}
          value={values}
          placeholder="Bob, bob@new.com, active"
          aria-invalid={issueFor('values') !== null}
          onChange={(next) => updateNodeConfig(nodeId, { values: next })}
        />
        {issueFor('values') && (
          <p role="alert" className="text-xs text-red-400">
            {issueFor('values')}
          </p>
        )}
      </div>

      <label htmlFor={lookupToggle} className="flex items-center gap-2 text-xs text-text-secondary">
        <input
          id={lookupToggle}
          type="checkbox"
          checked={matchByLookup}
          onChange={(e) => updateNodeConfig(nodeId, { matchByLookup: e.target.checked })}
          className="h-4 w-4 rounded border-white/10 bg-elevated text-accent-teal focus:ring-accent-teal"
        />
        Match target row by column lookup (instead of row index)
      </label>

      {matchByLookup ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={lookupColumnField} className={labelClass}>
              Lookup column
            </label>
            <DataPillInput
              id={lookupColumnField}
              nodeId={nodeId}
              value={lookupColumn}
              placeholder="Email"
              onChange={(next) => updateNodeConfig(nodeId, { lookupColumn: next })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={lookupValueField} className={labelClass}>
              Lookup value (must be unique)
            </label>
            <DataPillInput
              id={lookupValueField}
              nodeId={nodeId}
              value={lookupValue}
              placeholder="{{trigger.email}}"
              onChange={(next) => updateNodeConfig(nodeId, { lookupValue: next })}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={rowIndexField} className={labelClass}>
            Row index (0-based)
          </label>
          <input
            id={rowIndexField}
            type="number"
            min={0}
            value={rowIndex}
            className={inputClass}
            aria-invalid={issueFor('rowIndex') !== null}
            onChange={(e) =>
              updateNodeConfig(nodeId, {
                rowIndex: e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
          />
          {issueFor('rowIndex') && (
            <p role="alert" className="text-xs text-red-400">
              {issueFor('rowIndex')}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          id={mockId}
          type="checkbox"
          checked={mockOnDryRun}
          onChange={(e) => updateNodeConfig(nodeId, { mockOnDryRun: e.target.checked })}
          className="h-4 w-4 rounded border-white/10 bg-elevated text-accent-teal focus:ring-accent-teal"
        />
        <label htmlFor={mockId} className="text-xs text-text-secondary">
          Skip Excel call on test runs (return mocked output)
        </label>
      </div>
    </div>
  );
}
