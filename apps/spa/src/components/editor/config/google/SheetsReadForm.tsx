import { useId } from 'react';
import { sheetsReadConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function SheetsReadForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const spreadsheetId = asString(config.spreadsheetId);
  const range = asString(config.range);
  const mockOnDryRun = config.mockOnDryRun === true;

  const idId = useId();
  const rangeId = useId();
  const mockId = useId();

  const parsed = sheetsReadConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    spreadsheetId,
    range,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (f: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === f)?.message ?? null);

  return (
    <div data-testid="sheets-read-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Connection</span>
        <ConnectionPicker
          provider="google"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {issueFor('connectionId') && (
          <p
            data-testid="sheets-read-connection-error"
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
          <p data-testid="sheets-read-id-error" role="alert" className="text-xs text-red-400">
            {issueFor('spreadsheetId')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={rangeId} className={labelClass}>
          Range (A1 notation)
        </label>
        <DataPillInput
          id={rangeId}
          nodeId={nodeId}
          value={range}
          placeholder="Sheet1!A1:B10"
          onChange={(next) => updateNodeConfig(nodeId, { range: next })}
        />
        {issueFor('range') && (
          <p data-testid="sheets-read-range-error" role="alert" className="text-xs text-red-400">
            {issueFor('range')}
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
