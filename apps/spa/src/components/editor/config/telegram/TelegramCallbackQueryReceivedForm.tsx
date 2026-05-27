import { telegramMessageReceivedConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from '../formRegistry';
import { ConnectionPicker } from '../../ConnectionPicker';

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function TelegramCallbackQueryReceivedForm({
  nodeId,
  config,
}: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);

  const connectionId = asString(config.connectionId);

  // Reuse the message-received config shape (connectionId + optional chatId).
  const parsed = telegramMessageReceivedConfigSchema.safeParse({
    connectionId: connectionId || undefined,
  });
  const connIssue = parsed.success
    ? null
    : (parsed.error.issues.find((i) => i.path[0] === 'connectionId')?.message ?? null);

  return (
    <div data-testid="telegram-callback-query-received-form" className="flex flex-col gap-4">
      <p className="rounded-md border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">
        Activating registers this bot&apos;s webhook for inline-keyboard callbacks. A Telegram bot
        has a single webhook — activating this replaces any other Telegram trigger on the same bot.
      </p>

      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Telegram connection</span>
        <ConnectionPicker
          provider="telegram"
          value={connectionId || null}
          onChange={(next) => updateNodeConfig(nodeId, { connectionId: next })}
        />
        {connIssue && (
          <p role="alert" className="text-xs text-red-400">
            Select a Telegram connection.
          </p>
        )}
      </div>
    </div>
  );
}
