import { useId, useMemo, useState, type JSX } from 'react';
import {
  CONDITION_OPERATORS,
  conditionalConfigSchema,
  stringToBuilder,
  builderToString,
  type ConditionBuilder,
  type ConditionOperator,
} from '@tietide/shared';
import { useEditorStore } from '@/stores/editorStore';
import { cn } from '@/utils/cn';
import type { NodeConfigFormProps } from './formRegistry';
import { DataPillInput } from './DataPillInput';

const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  '===': 'equals',
  '!==': 'not equals',
  '==': 'loosely equals',
  '!=': 'loosely not equals',
  '>': 'greater than',
  '<': 'less than',
  '>=': 'greater or equal',
  '<=': 'less or equal',
  contains: 'contains',
};

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-text-secondary';
const selectClass = cn(
  'w-full rounded-md border border-white/10 bg-elevated px-3 py-2 text-sm text-text-primary',
  'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
);

type Mode = 'structured' | 'advanced';

const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Conditional (IF) node config with a friendly structured builder (left operand
 * + comparator + right operand, each operand pill-capable) AND an advanced raw
 * expression mode that round-trips with the builder (#7). `condition` (the
 * string) stays canonical — the worker only ever evaluates it — so legacy and
 * hand-written conditions keep working; `conditionBuilder` is an advisory mirror.
 */
export function ConditionalForm({ nodeId, config }: NodeConfigFormProps): JSX.Element {
  const updateNodeConfig = useEditorStore((s) => s.updateNodeConfig);
  const inputId = useId();
  const errorId = useId();

  const condition = asString(config.condition);
  const storedBuilder = config.conditionBuilder as Partial<ConditionBuilder> | undefined;
  const parsedFromString = useMemo(() => stringToBuilder(condition), [condition]);

  // The builder can be opened when there's a stored builder, the string parses
  // into one, or there's no condition yet (start fresh).
  const canStructured =
    storedBuilder != null || parsedFromString !== null || condition.trim() === '';
  const [mode, setMode] = useState<Mode>(canStructured ? 'structured' : 'advanced');

  const parsed = conditionalConfigSchema.safeParse({
    condition,
    conditionBuilder: storedBuilder,
  });
  const error = parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Invalid condition');

  // Effective builder shown in structured mode: stored value, else the parse of
  // the current string, else an empty default.
  const builder: ConditionBuilder = {
    left: storedBuilder?.left ?? parsedFromString?.left ?? '',
    operator: (storedBuilder?.operator ?? parsedFromString?.operator ?? '===') as ConditionOperator,
    right: storedBuilder?.right ?? parsedFromString?.right ?? '',
  };

  const writeBuilder = (next: ConditionBuilder): void => {
    updateNodeConfig(nodeId, { conditionBuilder: next, condition: builderToString(next) });
  };

  const switchTo = (next: Mode): void => {
    if (next === 'structured' && !canStructured) return; // can't represent this expression
    setMode(next);
  };

  return (
    <div data-testid="conditional-form" className="flex flex-col gap-3">
      <div
        className="flex w-fit items-center gap-1 rounded-md border border-white/10 bg-elevated p-0.5"
        role="tablist"
        aria-label="Condition editor mode"
      >
        {(['structured', 'advanced'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            data-testid={`conditional-mode-${m}`}
            disabled={m === 'structured' && !canStructured}
            onClick={() => switchTo(m)}
            className={cn(
              'rounded px-2.5 py-1 text-xs font-medium capitalize',
              'disabled:cursor-not-allowed disabled:opacity-40',
              mode === m ? 'bg-accent-teal/15 text-accent-teal' : 'text-text-muted',
            )}
          >
            {m}
          </button>
        ))}
      </div>

      {mode === 'structured' ? (
        <div className="flex flex-col gap-2" data-testid="conditional-structured">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${inputId}-left`} className={labelClass}>
              Value
            </label>
            <DataPillInput
              id={`${inputId}-left`}
              nodeId={nodeId}
              value={builder.left}
              placeholder="{{trigger.amount}}"
              onChange={(next) => writeBuilder({ ...builder, left: next })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${inputId}-op`} className={labelClass}>
              Comparator
            </label>
            <select
              id={`${inputId}-op`}
              data-testid="conditional-operator"
              value={builder.operator}
              onChange={(e) =>
                writeBuilder({ ...builder, operator: e.target.value as ConditionOperator })
              }
              className={selectClass}
            >
              {CONDITION_OPERATORS.map((op) => (
                <option key={op} value={op}>
                  {OPERATOR_LABELS[op]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${inputId}-right`} className={labelClass}>
              Compare to
            </label>
            <DataPillInput
              id={`${inputId}-right`}
              nodeId={nodeId}
              value={builder.right}
              placeholder={'100  or  "active"'}
              onChange={(next) => writeBuilder({ ...builder, right: next })}
            />
            <p className="text-xs text-text-muted">
              Quote text values (e.g. <span className="font-mono">&quot;active&quot;</span>);
              numbers and booleans are bare.
            </p>
            {builder.operator === 'contains' && (
              <p className="text-xs text-text-muted">
                <span className="font-mono">contains</span> matches when the left value is a list
                holding the right item, or text holding the right substring.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5" data-testid="conditional-advanced">
          <label htmlFor={inputId} className={labelClass}>
            Condition
          </label>
          <DataPillInput
            id={inputId}
            nodeId={nodeId}
            value={condition}
            placeholder="{{trigger.amount}} > 100"
            aria-invalid={error !== null}
            aria-describedby={error ? errorId : undefined}
            onChange={(next) =>
              updateNodeConfig(nodeId, { condition: next, conditionBuilder: undefined })
            }
          />
          <p className="text-xs text-text-muted">
            Expression: <span className="font-mono">left OP right</span>. Type{' '}
            <span className="font-mono">{'{{'}</span> to reference upstream output.
          </p>
        </div>
      )}

      {error && (
        <p id={errorId} role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
