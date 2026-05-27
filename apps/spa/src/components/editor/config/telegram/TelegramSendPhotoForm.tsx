import { useId } from 'react';
import { telegramSendPhotoConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { cn } from '@/utils/cn';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';
import { TelegramMediaFields } from './TelegramMediaFields';

const inputClass = cn(
  'w-full rounded-md border border-white/5 bg-elevated px-3 py-2',
  'text-sm text-text-primary placeholder:text-text-muted',
  'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
);
const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function TelegramSendPhotoForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const chatId = asString(config.chatId);
  const caption = asString(config.caption);

  const chatFieldId = useId();
  const captionId = useId();

  const parsed = telegramSendPhotoConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    chatId,
    source: asString(config.source) || 'url',
    url: asString(config.url) || undefined,
    fileId: asString(config.fileId) || undefined,
    contentBase64: asString(config.contentBase64) || undefined,
    filename: asString(config.filename) || undefined,
    caption: caption || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  return (
    <div data-testid="telegram-send-photo-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Telegram connection</span>
        <ConnectionPicker
          provider="telegram"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {issueFor('connectionId') && (
          <p role="alert" className="text-xs text-red-400">
            Select a Telegram connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={chatFieldId} className={labelClass}>
          Chat ID
        </label>
        <DataPillInput
          id={chatFieldId}
          nodeId={nodeId}
          value={chatId}
          placeholder="-1001234567890 or @channel"
          aria-invalid={issueFor('chatId') !== null}
          onChange={(next) => updateNodeConfig(nodeId, { chatId: next })}
        />
        {issueFor('chatId') && (
          <p role="alert" className="text-xs text-red-400">
            {issueFor('chatId')}
          </p>
        )}
      </div>

      <TelegramMediaFields nodeId={nodeId} config={config} kind="photo" />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={captionId} className={labelClass}>
          Caption (optional)
        </label>
        <textarea
          id={captionId}
          value={caption}
          rows={2}
          placeholder="Optional caption"
          onChange={(e) => updateNodeConfig(nodeId, { caption: e.target.value || undefined })}
          className={cn(inputClass, 'text-xs')}
        />
      </div>
    </div>
  );
}
