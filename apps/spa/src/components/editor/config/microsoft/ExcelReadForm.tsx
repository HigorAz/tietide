import { useId } from 'react';
import { excelReadConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function ExcelReadForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const workbookId = asString(config.workbookId);
  const worksheet = asString(config.worksheet);
  const range = asString(config.range);
  const mockOnDryRun = config.mockOnDryRun === true;

  const idId = useId();
  const sheetId = useId();
  const rangeId = useId();
  const mockId = useId();

  const parsed = excelReadConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    workbookId,
    worksheet,
    range,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (f: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === f)?.message ?? null);

  return (
    <div data-testid="excel-read-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Connection</span>
        <ConnectionPicker
          provider="microsoft"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {issueFor('connectionId') && (
          <p
            data-testid="excel-read-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Microsoft connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={idId} className={labelClass}>
          Workbook ID (OneDrive item ID)
        </label>
        <DataPillInput
          id={idId}
          nodeId={nodeId}
          value={workbookId}
          placeholder="01ABCDEFG..."
          onChange={(next) => updateNodeConfig(nodeId, { workbookId: next })}
        />
        {issueFor('workbookId') && (
          <p data-testid="excel-read-workbook-error" role="alert" className="text-xs text-red-400">
            {issueFor('workbookId')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={sheetId} className={labelClass}>
          Worksheet name
        </label>
        <DataPillInput
          id={sheetId}
          nodeId={nodeId}
          value={worksheet}
          placeholder="Sheet1"
          onChange={(next) => updateNodeConfig(nodeId, { worksheet: next })}
        />
        {issueFor('worksheet') && (
          <p data-testid="excel-read-sheet-error" role="alert" className="text-xs text-red-400">
            {issueFor('worksheet')}
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
          placeholder="A1:C10"
          onChange={(next) => updateNodeConfig(nodeId, { range: next })}
        />
        {issueFor('range') && (
          <p data-testid="excel-read-range-error" role="alert" className="text-xs text-red-400">
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
          Skip Excel call on test runs (return mocked output)
        </label>
      </div>
    </div>
  );
}
