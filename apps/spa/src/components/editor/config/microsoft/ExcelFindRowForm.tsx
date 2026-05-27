import { useId } from 'react';
import { excelFindRowConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const inputClass =
  'w-full rounded-md border border-white/10 bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

const MATCH_MODES = ['exact', 'contains', 'startsWith'] as const;

export function ExcelFindRowForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const workbookId = asString(config.workbookId);
  const worksheet = asString(config.worksheet);
  const tableName = asString(config.tableName) || 'Table1';
  const column = asString(config.column);
  const value = asString(config.value);
  const matchMode = asString(config.matchMode) || 'exact';
  const mockOnDryRun = config.mockOnDryRun === true;

  const workbookField = useId();
  const worksheetField = useId();
  const tableField = useId();
  const columnField = useId();
  const valueField = useId();
  const matchField = useId();
  const mockId = useId();

  const parsed = excelFindRowConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    workbookId,
    worksheet,
    tableName,
    column,
    value,
    matchMode,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const field = (
    id: string,
    key: string,
    label: string,
    val: string,
    placeholder: string,
  ): JSX.Element => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <DataPillInput
        id={id}
        nodeId={nodeId}
        value={val}
        placeholder={placeholder}
        aria-invalid={issueFor(key) !== null}
        onChange={(next) => updateNodeConfig(nodeId, { [key]: next })}
      />
      {issueFor(key) && (
        <p role="alert" className="text-xs text-red-400">
          {issueFor(key)}
        </p>
      )}
    </div>
  );

  return (
    <div data-testid="excel-find-row-form" className="flex flex-col gap-4">
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

      {field(workbookField, 'workbookId', 'Workbook (drive item) ID', workbookId, '01ABC...')}
      {field(worksheetField, 'worksheet', 'Worksheet', worksheet, 'Sheet1')}
      {field(tableField, 'tableName', 'Table name', tableName, 'Table1')}
      {field(columnField, 'column', 'Column header', column, 'Email')}
      {field(valueField, 'value', 'Value to match', value, '{{trigger.email}}')}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={matchField} className={labelClass}>
          Match mode
        </label>
        <select
          id={matchField}
          value={matchMode}
          className={inputClass}
          onChange={(e) => updateNodeConfig(nodeId, { matchMode: e.target.value })}
        >
          {MATCH_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
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
          Skip Excel call on test runs (return mocked output)
        </label>
      </div>
    </div>
  );
}
