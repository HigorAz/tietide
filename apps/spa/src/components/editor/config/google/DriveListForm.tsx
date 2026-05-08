import { useId } from 'react';
import { driveListConfigSchema } from '@tietide/shared';
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

export function DriveListForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const folderId = asString(config.folderId);
  const query = asString(config.query);
  const maxResults = typeof config.maxResults === 'number' ? config.maxResults : undefined;
  const mockOnDryRun = config.mockOnDryRun === true;

  const folderIdId = useId();
  const queryId = useId();
  const maxId = useId();
  const mockId = useId();

  const parsed = driveListConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    folderId,
    query: query || undefined,
    maxResults,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (f: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === f)?.message ?? null);

  return (
    <div data-testid="drive-list-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Connection</span>
        <ConnectionPicker
          provider="google"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {issueFor('connectionId') && (
          <p
            data-testid="drive-list-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Google connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={folderIdId} className={labelClass}>
          Folder ID
        </label>
        <DataPillInput
          id={folderIdId}
          nodeId={nodeId}
          value={folderId}
          placeholder="0ABCdefXyz123"
          onChange={(next) => updateNodeConfig(nodeId, { folderId: next })}
        />
        {issueFor('folderId') && (
          <p data-testid="drive-list-folder-error" role="alert" className="text-xs text-red-400">
            {issueFor('folderId')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={queryId} className={labelClass}>
          Drive query (optional)
        </label>
        <input
          id={queryId}
          type="text"
          value={query}
          onChange={(e) => updateNodeConfig(nodeId, { query: e.target.value || undefined })}
          placeholder="name contains 'report'"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={maxId} className={labelClass}>
          Max results (optional, ≤ 1000)
        </label>
        <input
          id={maxId}
          type="number"
          min={1}
          max={1000}
          value={maxResults ?? ''}
          placeholder="100"
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              updateNodeConfig(nodeId, { maxResults: undefined });
              return;
            }
            const n = Number(raw);
            if (Number.isFinite(n)) updateNodeConfig(nodeId, { maxResults: n });
          }}
          className={inputClass}
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
