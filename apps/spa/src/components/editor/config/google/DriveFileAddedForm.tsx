import { useId } from 'react';
import { driveFileAddedConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function DriveFileAddedForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const parentFolderId = asString(config.parentFolderId);
  const mimeType = asString(config.mimeType);

  const folderId = useId();
  const mimeId = useId();

  const parsed = driveFileAddedConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    parentFolderId,
    mimeType: mimeType || undefined,
  });
  const issueFor = (f: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === f)?.message ?? null);

  return (
    <div data-testid="drive-file-added-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Connection</span>
        <ConnectionPicker
          provider="google"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {issueFor('connectionId') && (
          <p
            data-testid="drive-file-added-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Google connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={folderId} className={labelClass}>
          Parent folder ID
        </label>
        <DataPillInput
          id={folderId}
          nodeId={nodeId}
          value={parentFolderId}
          placeholder="1AbCdEfGhIjK..."
          onChange={(next) => updateNodeConfig(nodeId, { parentFolderId: next })}
        />
        {issueFor('parentFolderId') && (
          <p
            data-testid="drive-file-added-folder-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {issueFor('parentFolderId')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={mimeId} className={labelClass}>
          MIME type filter (optional)
        </label>
        <DataPillInput
          id={mimeId}
          nodeId={nodeId}
          value={mimeType}
          placeholder="application/pdf"
          onChange={(next) => updateNodeConfig(nodeId, { mimeType: next || undefined })}
        />
      </div>
    </div>
  );
}
