import { useId } from 'react';
import { onedriveListFilesConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const inputClass =
  'w-full rounded-md border border-white/10 bg-elevated px-3 py-2 text-sm text-text-primary focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function OneDriveListFilesForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const folderId = asString(config.folderId);
  const folderPath = asString(config.folderPath);
  const top = typeof config.top === 'number' ? String(config.top) : '';
  const mockOnDryRun = config.mockOnDryRun === true;

  const folderIdField = useId();
  const folderPathField = useId();
  const topField = useId();
  const mockId = useId();

  const parsed = onedriveListFilesConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    folderId: folderId || undefined,
    folderPath: folderPath || undefined,
    top: top === '' ? undefined : Number(top),
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  return (
    <div data-testid="onedrive-list-files-form" className="flex flex-col gap-4">
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

      <p className="text-xs text-text-muted">
        Leave both fields empty to list the drive root. Folder ID takes precedence over path.
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={folderIdField} className={labelClass}>
          Folder ID (optional)
        </label>
        <DataPillInput
          id={folderIdField}
          nodeId={nodeId}
          value={folderId}
          placeholder="{{trigger.folder.id}}"
          onChange={(next) => updateNodeConfig(nodeId, { folderId: next })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={folderPathField} className={labelClass}>
          Folder path (optional)
        </label>
        <DataPillInput
          id={folderPathField}
          nodeId={nodeId}
          value={folderPath}
          placeholder="Documents/Reports"
          aria-invalid={issueFor('folderPath') !== null}
          onChange={(next) => updateNodeConfig(nodeId, { folderPath: next })}
        />
        {issueFor('folderPath') && (
          <p role="alert" className="text-xs text-red-400">
            {issueFor('folderPath')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={topField} className={labelClass}>
          Max results (optional, ≤ 200)
        </label>
        <input
          id={topField}
          type="number"
          min={1}
          max={200}
          value={top}
          className={inputClass}
          onChange={(e) =>
            updateNodeConfig(nodeId, {
              top: e.target.value === '' ? undefined : Number(e.target.value),
            })
          }
        />
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
