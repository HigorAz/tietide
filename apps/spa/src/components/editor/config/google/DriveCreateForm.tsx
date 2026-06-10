import { useId } from 'react';
import { driveCreateConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function DriveCreateForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const name = asString(config.name);
  const mimeType = asString(config.mimeType);
  const content = asString(config.content);
  const parentFolderId = asString(config.parentFolderId);
  const mockOnDryRun = config.mockOnDryRun === true;

  const nameId = useId();
  const mimeId = useId();
  const contentId = useId();
  const parentId = useId();
  const mockId = useId();

  const parsed = driveCreateConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    name,
    mimeType,
    content,
    parentFolderId: parentFolderId || undefined,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (f: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === f)?.message ?? null);

  return (
    <div data-testid="drive-create-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Connection</span>
        <ConnectionPicker
          provider="google"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {issueFor('connectionId') && (
          <p
            data-testid="drive-create-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Google connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className={labelClass}>
          File name
        </label>
        <DataPillInput
          id={nameId}
          nodeId={nodeId}
          value={name}
          placeholder="report-{{trigger.date}}.txt"
          onChange={(next) => updateNodeConfig(nodeId, { name: next })}
        />
        {issueFor('name') && (
          <p data-testid="drive-create-name-error" role="alert" className="text-xs text-red-400">
            {issueFor('name')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={mimeId} className={labelClass}>
          MIME type
        </label>
        <DataPillInput
          id={mimeId}
          nodeId={nodeId}
          value={mimeType}
          placeholder="text/plain"
          onChange={(next) => updateNodeConfig(nodeId, { mimeType: next })}
        />
        {issueFor('mimeType') && (
          <p data-testid="drive-create-mime-error" role="alert" className="text-xs text-red-400">
            {issueFor('mimeType')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={contentId} className={labelClass}>
          Content
        </label>
        <DataPillInput
          id={contentId}
          nodeId={nodeId}
          value={content}
          onChange={(next) => updateNodeConfig(nodeId, { content: next })}
        />
        {issueFor('content') && (
          <p data-testid="drive-create-content-error" role="alert" className="text-xs text-red-400">
            {issueFor('content')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={parentId} className={labelClass}>
          Parent folder ID (optional)
        </label>
        <DataPillInput
          id={parentId}
          nodeId={nodeId}
          value={parentFolderId}
          placeholder="0ABCdefXyz123"
          onChange={(next) => updateNodeConfig(nodeId, { parentFolderId: next || undefined })}
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
          Skip Drive call on test runs (return mocked output)
        </label>
      </div>
    </div>
  );
}
