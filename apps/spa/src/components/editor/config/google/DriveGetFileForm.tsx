import { useId } from 'react';
import { driveGetFileConfigSchema } from '@tietide/shared';
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

export function DriveGetFileForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const fileId = asString(config.fileId);
  const fields = asString(config.fields);
  const downloadContent = config.downloadContent === true;
  const mockOnDryRun = config.mockOnDryRun === true;

  const fileField = useId();
  const fieldsField = useId();
  const downloadId = useId();
  const mockId = useId();

  const parsed = driveGetFileConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    fileId,
    fields: fields || undefined,
    downloadContent: downloadContent || undefined,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);
  const connectionIssue = issueFor('connectionId');
  const fileIssue = issueFor('fileId');

  return (
    <div data-testid="drive-get-file-form" className="flex flex-col gap-4">
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
        <label htmlFor={fileField} className={labelClass}>
          File ID
        </label>
        <DataPillInput
          id={fileField}
          nodeId={nodeId}
          value={fileId}
          placeholder="1AbC..."
          aria-invalid={fileIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { fileId: next })}
        />
        {fileIssue && (
          <p role="alert" className="text-xs text-red-400">
            {fileIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={fieldsField} className={labelClass}>
          Fields mask (optional)
        </label>
        <input
          id={fieldsField}
          type="text"
          value={fields}
          placeholder="id,name,mimeType,size,modifiedTime"
          onChange={(e) => updateNodeConfig(nodeId, { fields: e.target.value || undefined })}
          className={inputClass}
        />
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
          Download file content as base64 (≤ 10 MB)
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
          Skip Drive call on test runs (return mocked output)
        </label>
      </div>
    </div>
  );
}
