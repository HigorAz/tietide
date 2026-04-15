import { useId } from 'react';
import { conditionalConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { cn } from '@/utils/cn';
import type { NodeConfigFormProps } from './formRegistry';

export function ConditionalForm({ nodeId, config }: NodeConfigFormProps) {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const inputId = useId();
  const errorId = useId();

  const condition = typeof config.condition === 'string' ? config.condition : '';
  const parsed = conditionalConfigSchema.safeParse({ condition });
  const error = parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Invalid condition');

  return (
    <div data-testid="conditional-form" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={inputId}
          className="text-xs font-semibold uppercase tracking-wider text-text-secondary"
        >
          Condition
        </label>
        <input
          id={inputId}
          type="text"
          value={condition}
          placeholder="input.amount > 100"
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => updateNodeConfig(nodeId, { condition: e.target.value })}
          className={cn(
            'w-full rounded-md border border-white/5 bg-elevated px-3 py-2 font-mono',
            'text-sm text-text-primary placeholder:text-text-muted',
            'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
          )}
        />
        <p className="text-xs text-text-muted">
          JavaScript expression. Branches true when it evaluates to a truthy value.
        </p>
        {error && (
          <p id={errorId} role="alert" className="text-xs text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
