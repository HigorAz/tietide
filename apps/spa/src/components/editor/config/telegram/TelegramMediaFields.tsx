import { useId } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { cn } from '@/utils/cn';
import { DataPillInput } from '../DataPillInput';

const inputClass = cn(
  'w-full rounded-md border border-white/5 bg-elevated px-3 py-2',
  'text-sm text-text-primary placeholder:text-text-muted',
  'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
);
const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

interface TelegramMediaFieldsProps {
  nodeId: string;
  config: Record<string, unknown>;
  kind: 'photo' | 'document';
}

// Shared source picker for telegram-send-photo / telegram-send-document: choose
// a public URL, an existing file_id, or upload a file (read to base64).
export function TelegramMediaFields({
  nodeId,
  config,
  kind,
}: TelegramMediaFieldsProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const source = asString(config.source) || 'url';
  const url = asString(config.url);
  const fileId = asString(config.fileId);
  const filename = asString(config.filename);

  const sourceId = useId();
  const urlId = useId();
  const fileIdFieldId = useId();
  const uploadId = useId();

  const onFile = (file: File | undefined): void => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.slice(result.indexOf(',') + 1) : result;
      updateNodeConfig(nodeId, { contentBase64: base64, filename: file.name });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={sourceId} className={labelClass}>
          {kind === 'photo' ? 'Photo' : 'Document'} source
        </label>
        <select
          id={sourceId}
          value={source}
          onChange={(e) => updateNodeConfig(nodeId, { source: e.target.value })}
          className={inputClass}
        >
          <option value="url">Public URL</option>
          <option value="fileId">Existing file_id</option>
          <option value="upload">Upload file</option>
        </select>
      </div>

      {source === 'url' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={urlId} className={labelClass}>
            URL
          </label>
          <DataPillInput
            id={urlId}
            nodeId={nodeId}
            value={url}
            placeholder="https://example.com/file"
            onChange={(next) => updateNodeConfig(nodeId, { url: next })}
          />
        </div>
      )}

      {source === 'fileId' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={fileIdFieldId} className={labelClass}>
            Telegram file_id
          </label>
          <DataPillInput
            id={fileIdFieldId}
            nodeId={nodeId}
            value={fileId}
            placeholder="AgACAgID..."
            onChange={(next) => updateNodeConfig(nodeId, { fileId: next })}
          />
        </div>
      )}

      {source === 'upload' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={uploadId} className={labelClass}>
            File {filename ? `(${filename})` : ''}
          </label>
          <input
            id={uploadId}
            type="file"
            onChange={(e) => onFile(e.target.files?.[0])}
            className="text-xs text-text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-elevated file:px-3 file:py-1.5 file:text-text-primary"
          />
        </div>
      )}
    </div>
  );
}
