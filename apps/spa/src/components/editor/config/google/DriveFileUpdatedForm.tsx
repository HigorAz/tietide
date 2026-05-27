import { useId } from 'react';
import { driveFileUpdatedConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { cn } from '@/utils/cn';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';

const inputClass = cn(
  'w-full rounded-md border border-white/5 bg-elevated px-3 py-2',
  'text-sm text-text-primary placeholder:text-text-muted',
  'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
);
const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function DriveFileUpdatedForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const fileId = asString(config.fileId);

  const fileIdId = useId();

  const parsed = driveFileUpdatedConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    fileId,
  });
  const issueFor = (f: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === f)?.message ?? null);

  return (
    <div data-testid="drive-file-updated-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Connection</span>
        <ConnectionPicker
          provider="google"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {issueFor('connectionId') && (
          <p
            data-testid="drive-file-updated-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Google connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={fileIdId} className={labelClass}>
          File ID
        </label>
        <input
          id={fileIdId}
          type="text"
          value={fileId}
          onChange={(e) => updateNodeConfig(nodeId, { fileId: e.target.value })}
          placeholder="1AbCdEfGhIjK..."
          className={inputClass}
        />
        {issueFor('fileId') && (
          <p
            data-testid="drive-file-updated-file-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {issueFor('fileId')}
          </p>
        )}
      </div>
    </div>
  );
}
