import { useId } from 'react';
import { onedriveFileAddedConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function OneDriveFileAddedForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const folderPath = asString(config.folderPath);

  const folderId = useId();

  const parsed = onedriveFileAddedConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    folderPath: folderPath || undefined,
  });
  const issueFor = (f: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === f)?.message ?? null);

  return (
    <div data-testid="onedrive-file-added-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Connection</span>
        <ConnectionPicker
          provider="microsoft"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {issueFor('connectionId') && (
          <p
            data-testid="onedrive-file-added-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Microsoft connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={folderId} className={labelClass}>
          Folder path (optional)
        </label>
        <DataPillInput
          id={folderId}
          nodeId={nodeId}
          value={folderPath}
          placeholder="/Documents/Inbox"
          onChange={(next) => updateNodeConfig(nodeId, { folderPath: next || undefined })}
        />
        {issueFor('folderPath') && (
          <p
            data-testid="onedrive-file-added-folder-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {issueFor('folderPath')}
          </p>
        )}
        <p className="text-xs text-text-muted">
          The Microsoft Graph drive subscription always watches{' '}
          <code className="font-mono text-[11px]">/me/drive/root</code>. Use this field if you want
          to filter notifications inside the workflow to a specific folder path.
        </p>
      </div>
    </div>
  );
}
