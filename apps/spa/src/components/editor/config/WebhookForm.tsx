import { useId } from 'react';
import { webhookConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { cn } from '@/utils/cn';
import type { NodeConfigFormProps } from './formRegistry';

export function WebhookForm({ nodeId, config }: NodeConfigFormProps) {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const inputId = useId();
  const errorId = useId();

  const path = typeof config.path === 'string' ? config.path : '';
  const parsed = webhookConfigSchema.safeParse({ path: path === '' ? undefined : path });
  const error = parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Invalid path');

  return (
    <div data-testid="webhook-form" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={inputId}
          className="text-xs font-semibold uppercase tracking-wider text-text-secondary"
        >
          Path
        </label>
        <input
          id={inputId}
          type="text"
          value={path}
          placeholder="orders-webhook"
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            const value = e.target.value;
            updateNodeConfig(nodeId, { path: value === '' ? undefined : value });
          }}
          className={cn(
            'w-full rounded-md border border-white/5 bg-elevated px-3 py-2',
            'text-sm text-text-primary placeholder:text-text-muted',
            'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
          )}
        />
        <p className="text-xs text-text-muted">Optional. Appended to the webhook base URL.</p>
        {error && (
          <p id={errorId} role="alert" className="text-xs text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
