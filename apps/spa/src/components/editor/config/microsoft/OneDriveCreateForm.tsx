import { useId, useMemo, useState } from 'react';
import { onedriveCreateConfigSchema } from '@tietide/shared';
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

const utf8ToBase64 = (s: string): string => {
  if (typeof globalThis.Buffer !== 'undefined') {
    return globalThis.Buffer.from(s, 'utf8').toString('base64');
  }
  return btoa(unescape(encodeURIComponent(s)));
};

const base64ToUtf8 = (s: string): string => {
  if (!s) return '';
  try {
    if (typeof globalThis.Buffer !== 'undefined') {
      return globalThis.Buffer.from(s, 'base64').toString('utf8');
    }
    return decodeURIComponent(escape(atob(s)));
  } catch {
    return '';
  }
};

export function OneDriveCreateForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const connectionId = asString(config.connectionId);
  const name = asString(config.name);
  const mimeType = asString(config.mimeType);
  const contentBase64 = asString(config.contentBase64);
  const parentFolderId = asString(config.parentFolderId);
  const mockOnDryRun = config.mockOnDryRun === true;

  const nameId = useId();
  const mimeId = useId();
  const contentId = useId();
  const parentId = useId();
  const mockId = useId();

  const initialContent = useMemo(() => base64ToUtf8(contentBase64), [contentBase64]);
  const [contentText, setContentText] = useState(initialContent);

  const parsed = onedriveCreateConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    name,
    mimeType,
    contentBase64,
    parentFolderId: parentFolderId || undefined,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (f: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === f)?.message ?? null);

  const handleContentBlur = () => {
    updateNodeConfig(nodeId, { contentBase64: utf8ToBase64(contentText) });
  };

  return (
    <div data-testid="onedrive-create-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Connection</span>
        <ConnectionPicker
          provider="microsoft"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {issueFor('connectionId') && (
          <p
            data-testid="onedrive-create-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Microsoft connection.
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
          <p data-testid="onedrive-create-name-error" role="alert" className="text-xs text-red-400">
            {issueFor('name')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={mimeId} className={labelClass}>
          MIME type
        </label>
        <input
          id={mimeId}
          type="text"
          value={mimeType}
          onChange={(e) => updateNodeConfig(nodeId, { mimeType: e.target.value })}
          placeholder="text/plain"
          className={inputClass}
        />
        {issueFor('mimeType') && (
          <p data-testid="onedrive-create-mime-error" role="alert" className="text-xs text-red-400">
            {issueFor('mimeType')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={contentId} className={labelClass}>
          Content (UTF-8 text — encoded as base64 on save)
        </label>
        <textarea
          id={contentId}
          value={contentText}
          onChange={(e) => setContentText(e.target.value)}
          onBlur={handleContentBlur}
          rows={6}
          className={cn(inputClass, 'font-mono text-xs')}
        />
        <p className="text-xs text-text-muted">Committed on blur.</p>
        {issueFor('contentBase64') && (
          <p
            data-testid="onedrive-create-content-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {issueFor('contentBase64')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={parentId} className={labelClass}>
          Parent folder ID (optional, OneDrive item ID)
        </label>
        <input
          id={parentId}
          type="text"
          value={parentFolderId}
          onChange={(e) =>
            updateNodeConfig(nodeId, { parentFolderId: e.target.value || undefined })
          }
          placeholder="01ABCDEFG..."
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
          Skip OneDrive call on test runs (return mocked output)
        </label>
      </div>
    </div>
  );
}
