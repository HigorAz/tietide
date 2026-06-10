import { useId, useState } from 'react';
import { sheetsAppendConfigSchema } from '@tietide/shared';
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

const isValueMatrix = (v: unknown): v is unknown[][] =>
  Array.isArray(v) && v.every((r) => Array.isArray(r));

export function SheetsAppendForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const spreadsheetId = asString(config.spreadsheetId);
  const sheet = asString(config.sheet);
  const values = isValueMatrix(config.values) ? config.values : [];
  const mockOnDryRun = config.mockOnDryRun === true;

  const idId = useId();
  const sheetId = useId();
  const valuesId = useId();
  const mockId = useId();

  const initialText = values.length === 0 ? '[\n  ["a", 1]\n]' : JSON.stringify(values, null, 2);
  const [valuesText, setValuesText] = useState(initialText);
  const [valuesError, setValuesError] = useState<string | null>(null);

  const parsed = sheetsAppendConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    spreadsheetId,
    sheet,
    values,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (f: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === f)?.message ?? null);

  const handleValuesBlur = () => {
    try {
      const next = JSON.parse(valuesText);
      if (!isValueMatrix(next)) {
        setValuesError('Values must be a JSON array of arrays.');
        return;
      }
      setValuesError(null);
      updateNodeConfig(nodeId, { values: next });
    } catch {
      setValuesError('Values is not valid JSON.');
    }
  };

  return (
    <div data-testid="sheets-append-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Connection</span>
        <ConnectionPicker
          provider="google"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {issueFor('connectionId') && (
          <p
            data-testid="sheets-append-connection-error"
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
          <p data-testid="sheets-append-id-error" role="alert" className="text-xs text-red-400">
            {issueFor('spreadsheetId')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={sheetId} className={labelClass}>
          Sheet name
        </label>
        <DataPillInput
          id={sheetId}
          nodeId={nodeId}
          value={sheet}
          placeholder="Sheet1"
          onChange={(next) => updateNodeConfig(nodeId, { sheet: next })}
        />
        {issueFor('sheet') && (
          <p data-testid="sheets-append-sheet-error" role="alert" className="text-xs text-red-400">
            {issueFor('sheet')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={valuesId} className={labelClass}>
          Values (JSON array of rows)
        </label>
        <textarea
          id={valuesId}
          value={valuesText}
          onChange={(e) => setValuesText(e.target.value)}
          onBlur={handleValuesBlur}
          rows={6}
          className={cn(inputClass, 'font-mono text-xs')}
        />
        <p className="text-xs text-text-muted">JSON. Committed on blur.</p>
        {valuesError && (
          <p data-testid="sheets-append-values-error" role="alert" className="text-xs text-red-400">
            {valuesError}
          </p>
        )}
        {!valuesError && issueFor('values') && (
          <p data-testid="sheets-append-values-error" role="alert" className="text-xs text-red-400">
            {issueFor('values')}
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
