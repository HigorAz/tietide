import { useId } from 'react';
import { cronConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { cn } from '@/utils/cn';
import type { NodeConfigFormProps } from './formRegistry';

export function CronForm({ nodeId, config }: NodeConfigFormProps) {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const inputId = useId();
  const errorId = useId();

  const expression = typeof config.expression === 'string' ? config.expression : '';
  const parsed = cronConfigSchema.safeParse({ expression });
  const error = parsed.success
    ? null
    : (parsed.error.issues[0]?.message ?? 'Invalid cron expression');

  return (
    <div data-testid="cron-form" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={inputId}
          className="text-xs font-semibold uppercase tracking-wider text-text-secondary"
        >
          Expression
        </label>
        <input
          id={inputId}
          type="text"
          value={expression}
          placeholder="*/5 * * * *"
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => updateNodeConfig(nodeId, { expression: e.target.value })}
          className={cn(
            'w-full rounded-md border border-white/5 bg-elevated px-3 py-2 font-mono',
            'text-sm text-text-primary placeholder:text-text-muted',
            'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
          )}
        />
        {error && (
          <p id={errorId} role="alert" className="text-xs text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
