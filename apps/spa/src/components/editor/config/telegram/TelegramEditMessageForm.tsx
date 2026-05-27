import { useId } from 'react';
import { telegramEditMessageConfigSchema } from '@tietide/shared';
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

export function TelegramEditMessageForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const chatId = asString(config.chatId);
  const messageId = typeof config.messageId === 'number' ? config.messageId : '';
  const text = asString(config.text);

  const chatFieldId = useId();
  const messageFieldId = useId();
  const textId = useId();

  const parsed = telegramEditMessageConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    chatId,
    messageId: typeof config.messageId === 'number' ? config.messageId : undefined,
    text,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  return (
    <div data-testid="telegram-edit-message-form" className="flex flex-col gap-4">
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

      <div className="flex flex-col gap-1.5">
        <label htmlFor={messageFieldId} className={labelClass}>
          Message ID
        </label>
        <input
          id={messageFieldId}
          type="number"
          min={1}
          value={messageId}
          placeholder="42"
          onChange={(e) =>
            updateNodeConfig(nodeId, {
              messageId: e.target.value === '' ? undefined : Number(e.target.value),
            })
          }
          className={inputClass}
        />
        {issueFor('messageId') && (
          <p role="alert" className="text-xs text-red-400">
            {issueFor('messageId')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={textId} className={labelClass}>
          New text
        </label>
        <textarea
          id={textId}
          value={text}
          rows={4}
          placeholder="Updated message"
          aria-invalid={issueFor('text') !== null}
          onChange={(e) => updateNodeConfig(nodeId, { text: e.target.value })}
          className={cn(inputClass, 'font-mono text-xs')}
        />
        {issueFor('text') && (
          <p role="alert" className="text-xs text-red-400">
            {issueFor('text')}
          </p>
        )}
      </div>
    </div>
  );
}
