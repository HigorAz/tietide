import { useId } from 'react';
import { telegramMessageReceivedConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';
import { DataPillInput } from '../DataPillInput';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function TelegramMessageReceivedForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const chatId = asString(config.chatId);

  const chatInputId = useId();

  const parsed = telegramMessageReceivedConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    chatId: chatId || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const chatIssue = issueFor('chatId');

  return (
    <div data-testid="telegram-message-received-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Telegram connection</span>
        <ConnectionPicker
          provider="telegram"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="telegram-message-received-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Telegram connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={chatInputId} className={labelClass}>
          Chat ID filter (optional)
        </label>
        <DataPillInput
          id={chatInputId}
          nodeId={nodeId}
          value={chatId}
          placeholder="123456789 or @channel"
          aria-invalid={chatIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { chatId: next || undefined })}
        />
        {chatIssue && (
          <p
            data-testid="telegram-message-received-chat-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {chatIssue}
          </p>
        )}
      </div>
    </div>
  );
}
