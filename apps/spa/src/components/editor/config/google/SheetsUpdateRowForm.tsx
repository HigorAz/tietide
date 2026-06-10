import { useId } from 'react';
import { sheetsUpdateRowConfigSchema } from '@tietide/shared';
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
const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : String(x ?? ''))) : [];

export function SheetsUpdateRowForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const spreadsheetId = asString(config.spreadsheetId);
  const sheet = asString(config.sheet);
  const rowNumber = typeof config.rowNumber === 'number' ? config.rowNumber : undefined;
  const values = asStringArray(config.values);
  const mockOnDryRun = config.mockOnDryRun === true;

  const spreadsheetField = useId();
  const sheetField = useId();
  const rowField = useId();
  const valuesField = useId();
  const mockId = useId();

  const parsed = sheetsUpdateRowConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    spreadsheetId,
    sheet,
    rowNumber,
    values: values.length ? values : undefined,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);
  const connectionIssue = issueFor('connectionId');
  const spreadsheetIssue = issueFor('spreadsheetId');
  const sheetIssue = issueFor('sheet');
  const rowIssue = issueFor('rowNumber');
  const valuesIssue = issueFor('values');

  return (
    <div data-testid="sheets-update-row-form" className="flex flex-col gap-4">
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
        <label htmlFor={sheetField} className={labelClass}>
          Sheet / tab name
        </label>
        <DataPillInput
          id={sheetField}
          nodeId={nodeId}
          value={sheet}
          placeholder="Sheet1"
          aria-invalid={sheetIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { sheet: next })}
        />
        {sheetIssue && (
          <p role="alert" className="text-xs text-red-400">
            {sheetIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={rowField} className={labelClass}>
          Row number (1-based)
        </label>
        <input
          id={rowField}
          type="number"
          min={1}
          value={rowNumber ?? ''}
          placeholder="5"
          aria-invalid={rowIssue !== null}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              updateNodeConfig(nodeId, { rowNumber: undefined });
              return;
            }
            const n = Number(raw);
            if (Number.isFinite(n)) updateNodeConfig(nodeId, { rowNumber: n });
          }}
          className={inputClass}
        />
        {rowIssue && (
          <p role="alert" className="text-xs text-red-400">
            {rowIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={valuesField} className={labelClass}>
          Cell values (comma-separated, left to right)
        </label>
        <input
          id={valuesField}
          type="text"
          value={values.join(', ')}
          placeholder="Alice, alice@x.com, active"
          aria-invalid={valuesIssue !== null}
          onChange={(e) =>
            updateNodeConfig(nodeId, {
              values: e.target.value.split(',').map((s) => s.trim()),
            })
          }
          className={inputClass}
        />
        {valuesIssue && (
          <p role="alert" className="text-xs text-red-400">
            {valuesIssue}
          </p>
        )}
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
          Skip Sheets call on test runs (return mocked output)
        </label>
      </div>
    </div>
  );
}
