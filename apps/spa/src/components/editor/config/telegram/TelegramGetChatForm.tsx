import { useId } from 'react';
import { telegramGetChatConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function TelegramGetChatForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const chatId = asString(config.chatId);

  const chatFieldId = useId();

  const parsed = telegramGetChatConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    chatId,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  return (
    <div data-testid="telegram-get-chat-form" className="flex flex-col gap-4">
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
    </div>
  );
}
