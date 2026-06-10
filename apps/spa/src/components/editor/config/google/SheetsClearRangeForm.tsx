import { useId } from 'react';
import { sheetsClearRangeConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function SheetsClearRangeForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const spreadsheetId = asString(config.spreadsheetId);
  const range = asString(config.range);
  const mockOnDryRun = config.mockOnDryRun === true;

  const spreadsheetField = useId();
  const rangeField = useId();
  const mockId = useId();

  const parsed = sheetsClearRangeConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    spreadsheetId,
    range,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);
  const connectionIssue = issueFor('connectionId');
  const spreadsheetIssue = issueFor('spreadsheetId');
  const rangeIssue = issueFor('range');

  return (
    <div data-testid="sheets-clear-range-form" className="flex flex-col gap-4">
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
          Range to clear (A1 notation)
        </label>
        <DataPillInput
          id={rangeField}
          nodeId={nodeId}
          value={range}
          placeholder="Sheet1!A2:D"
          aria-invalid={rangeIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { range: next })}
        />
        {rangeIssue && (
          <p role="alert" className="text-xs text-red-400">
            {rangeIssue}
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
