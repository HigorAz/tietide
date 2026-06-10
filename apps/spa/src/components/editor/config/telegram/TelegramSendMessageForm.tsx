import { useId } from 'react';
import { telegramSendMessageConfigSchema, TELEGRAM_PARSE_MODES } from '@tietide/shared';
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

export function TelegramSendMessageForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);
  const chatId = asString(config.chatId);
  const text = asString(config.text);
  const parseMode = asString(config.parseMode);
  const disableNotification = config.disableNotification === true;
  const mockOnDryRun = config.mockOnDryRun === true;

  const chatInputId = useId();
  const textFieldId = useId();
  const parseModeId = useId();
  const notifId = useId();
  const mockId = useId();

  const parsed = telegramSendMessageConfigSchema.safeParse({
    connectionId: connectionId || undefined,
    chatId,
    text,
    parseMode: parseMode || undefined,
    disableNotification: disableNotification || undefined,
    mockOnDryRun: mockOnDryRun || undefined,
  });
  const issueFor = (field: string): string | null =>
    parsed.success ? null : (parsed.error.issues.find((i) => i.path[0] === field)?.message ?? null);

  const connIssue = issueFor('connectionId');
  const chatIssue = issueFor('chatId');
  const textIssue = issueFor('text');

  return (
    <div data-testid="telegram-send-message-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Telegram connection</span>
        <ConnectionPicker
          provider="telegram"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p
            data-testid="telegram-send-message-connection-error"
            role="alert"
            className="text-xs text-red-400"
          >
            Select a Telegram connection.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={chatInputId} className={labelClass}>
          Chat ID or @channel-handle
        </label>
        <DataPillInput
          id={chatInputId}
          nodeId={nodeId}
          value={chatId}
          placeholder="123456789 or @channel"
          aria-invalid={chatIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { chatId: next })}
        />
        {chatIssue && (
          <p
            data-testid="telegram-send-message-chat-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {chatIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={textFieldId} className={labelClass}>
          Message
        </label>
        <DataPillInput
          id={textFieldId}
          nodeId={nodeId}
          value={text}
          aria-invalid={textIssue !== null}
          onChange={(next) => updateNodeConfig(nodeId, { text: next })}
        />
        {textIssue && (
          <p
            data-testid="telegram-send-message-text-error"
            role="alert"
            className="text-xs text-red-400"
          >
            {textIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={parseModeId} className={labelClass}>
          Parse mode (optional)
        </label>
        <select
          id={parseModeId}
          value={parseMode}
          onChange={(e) => updateNodeConfig(nodeId, { parseMode: e.target.value || undefined })}
          className={inputClass}
        >
          <option value="">Plain text</option>
          {TELEGRAM_PARSE_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <input
          id={notifId}
          type="checkbox"
          checked={disableNotification}
          onChange={(e) =>
            updateNodeConfig(nodeId, { disableNotification: e.target.checked || undefined })
          }
          className="h-4 w-4 rounded border-white/10 bg-elevated text-accent-teal focus:ring-accent-teal"
        />
        <label htmlFor={notifId} className="text-xs text-text-secondary">
          Send silently (no notification)
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
          Skip Telegram call on test runs
        </label>
      </div>
    </div>
  );
}
