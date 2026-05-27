import { useId } from 'react';
import { onedriveGetFileConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function OneDriveGetFileForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const itemId = asString(config.itemId);
  const downloadContent = config.downloadContent !== false;
  const mockOnDryRun = config.mockOnDryRun === true;

  const itemIdField = useId();
  const downloadId = useId();
  const mockId = useId();

  const parsed = onedriveGetFileConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    itemId,
    downloadContent,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  return (
    <div data-testid="onedrive-get-file-form" className="flex flex-col gap-4">
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
        <label htmlFor={itemIdField} className={labelClass}>
          Drive item ID
        </label>
        <DataPillInput
          id={itemIdField}
          nodeId={nodeId}
          value={itemId}
          placeholder="{{trigger.file.id}}"
          aria-invalid={issueFor('itemId') !== null}
          onChange={(next) => updateNodeConfig(nodeId, { itemId: next })}
        />
        {issueFor('itemId') && (
          <p role="alert" className="text-xs text-red-400">
            {issueFor('itemId')}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          id={downloadId}
          type="checkbox"
          checked={downloadContent}
          onChange={(e) => updateNodeConfig(nodeId, { downloadContent: e.target.checked })}
          className="h-4 w-4 rounded border-white/10 bg-elevated text-accent-teal focus:ring-accent-teal"
        />
        <label htmlFor={downloadId} className="text-xs text-text-secondary">
          Download file content as base64 (files over ~10 MB return metadata only)
        </label>
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
          Skip OneDrive call on test runs (return mocked output)
        </label>
      </div>
    </div>
  );
}
