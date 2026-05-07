import { useId } from 'react';
import { conditionalConfigSchema } from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import type { NodeConfigFormProps } from './formRegistry';
import { DataPillInput } from './DataPillInput';

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
        <DataPillInput
          id={inputId}
          nodeId={nodeId}
          value={condition}
          placeholder="{{trigger.amount}} > 100"
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          onChange={(next) => updateNodeConfig(nodeId, { condition: next })}
        />
        <p className="text-xs text-text-muted">
          JavaScript expression. Type <span className="font-mono">{'{{'}</span> to reference
          upstream node output.
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
