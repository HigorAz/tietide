import { useId } from 'react';
import { sheetsFindRowConfigSchema } from '@tietide/shared';
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
const checkboxClass =
  'h-4 w-4 rounded border-white/10 bg-elevated text-accent-teal focus:ring-accent-teal';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function SheetsFindRowForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const spreadsheetId = asString(config.spreadsheetId);
  const range = asString(config.range);
  const column =
    typeof config.column === 'number' ? String(config.column) : asString(config.column);
  const value = asString(config.value);
  const hasHeaderRow = config.hasHeaderRow === true;
  const firstMatchOnly = config.firstMatchOnly === true;
  const mockOnDryRun = config.mockOnDryRun === true;

  const spreadsheetField = useId();
  const rangeField = useId();
  const columnField = useId();
  const valueField = useId();
  const headerId = useId();
  const firstId = useId();
  const mockId = useId();

  // A purely-numeric value is treated as a 0-based column index; otherwise it's
  // a header name (which requires "first row is headers").
  const onColumnChange = (raw: string): void => {
    const trimmed = raw.trim();
    if (trimmed !== '' && /^\d+$/.test(trimmed)) {
      updateNodeConfig(nodeId, { column: Number(trimmed) });
    } else {
      updateNodeConfig(nodeId, { column: raw });
    }
  };

  const parsed = sheetsFindRowConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    spreadsheetId,
    range,
    column: typeof config.column === 'number' ? config.column : column || undefined,
    value,
    hasHeaderRow: hasHeaderRow || undefined,
    firstMatchOnly: firstMatchOnly || undefined,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);
  const connectionIssue = issueFor('connectionId');
  const spreadsheetIssue = issueFor('spreadsheetId');
  const rangeIssue = issueFor('range');
  const columnIssue = issueFor('column');

  return (
    <div data-testid="sheets-find-row-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Connection</span>
        <ConnectionPicker
          provider="google"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connectionIssue && (
          <p role="alert" className="text-xs text-red-400">
            Select a Google connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={spreadsheetField} className={labelClass}>
          Spreadsheet ID
        </label>
        <DataPillInput
          id={spreadsheetField}
          nodeId={nodeId}
          value={spreadsheetId}
          placeholder="1AbC..."
          aria-invalid={spreadsheetIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { spreadsheetId: next })}
        />
        {spreadsheetIssue && (
          <p role="alert" className="text-xs text-red-400">
            {spreadsheetIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={rangeField} className={labelClass}>
          Range (A1 notation)
        </label>
        <input
          id={rangeField}
          type="text"
          value={range}
          placeholder="Sheet1!A:D"
          aria-invalid={rangeIssue !== null}
          onChange={(e) => updateNodeConfig(nodeId, { range: e.target.value })}
          className={inputClass}
        />
        {rangeIssue && (
          <p role="alert" className="text-xs text-red-400">
            {rangeIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={columnField} className={labelClass}>
          Column (header name or 0-based index)
        </label>
        <input
          id={columnField}
          type="text"
          value={column}
          placeholder="email or 1"
          aria-invalid={columnIssue !== null}
          onChange={(e) => onColumnChange(e.target.value)}
          className={inputClass}
        />
        {columnIssue && (
          <p role="alert" className="text-xs text-red-400">
            {columnIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={valueField} className={labelClass}>
          Value to match
        </label>
        <DataPillInput
          id={valueField}
          nodeId={nodeId}
          value={value}
          placeholder="{{trigger.email}}"
          onChange={(next) => updateNodeConfig(nodeId, { value: next })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2">
          <input
            id={headerId}
            type="checkbox"
            checked={hasHeaderRow}
            onChange={(e) => updateNodeConfig(nodeId, { hasHeaderRow: e.target.checked })}
            className={checkboxClass}
          />
          <span className="text-xs text-text-secondary">First row is headers</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            id={firstId}
            type="checkbox"
            checked={firstMatchOnly}
            onChange={(e) => updateNodeConfig(nodeId, { firstMatchOnly: e.target.checked })}
            className={checkboxClass}
          />
          <span className="text-xs text-text-secondary">Stop at first match</span>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <input
          id={mockId}
          type="checkbox"
          checked={mockOnDryRun}
          onChange={(e) => updateNodeConfig(nodeId, { mockOnDryRun: e.target.checked })}
          className={checkboxClass}
        />
        <label htmlFor={mockId} className="text-xs text-text-secondary">
          Skip Sheets call on test runs (return mocked output)
        </label>
      </div>
    </div>
  );
}
