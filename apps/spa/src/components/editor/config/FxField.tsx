import { useState, type JSX } from 'react';
import { cn } from '@/utils/cn';
import { DataPillInput } from './DataPillInput';
import { FieldLabel } from './FieldLabel';

const inputClass = cn(
  'w-full rounded-md border border-white/10 bg-elevated px-3 py-2',
  'text-sm text-text-primary placeholder:text-text-muted',
  'focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
);

export type FxKind = 'text' | 'number' | 'select';

export interface FxFieldProps {
  fieldId: string;
  testId: string;
  nodeId: string;
  label: string;
  kind: FxKind;
  /** Current config value (literal of the kind, or a `{{pill}}` template string). */
  value: unknown;
  onChange: (next: unknown) => void;
  required?: boolean;
  help?: string;
  placeholder?: string;
  multiline?: boolean;
  options?: ReadonlyArray<{ value: string; label: string }>;
  issue?: string | null;
}

const asString = (v: unknown): string => (typeof v === 'string' ? v : '');
const asNumberString = (v: unknown): string =>
  typeof v === 'number' && Number.isFinite(v) ? String(v) : '';

const isTemplate = (v: unknown): v is string => typeof v === 'string' && v.includes('{{');

/**
 * A config field with a per-field "fx" toggle: switch between a native literal
 * input (text / number / select, with its native validation) and an expression
 * input (DataPillInput) that accepts `{{pill}}` tokens (#6). Expression mode is
 * derived from the value (a template string) but can be forced on for an empty
 * field via the toggle. Backed by the shared `templatable()` schema so a sole
 * pill resolves to its real typed value at runtime.
 */
export function FxField({
  fieldId,
  testId,
  nodeId,
  label,
  kind,
  value,
  onChange,
  required,
  help,
  placeholder,
  multiline,
  options,
  issue,
}: FxFieldProps): JSX.Element {
  // Mode follows the value (a template ⇒ expression) unless the user overrides
  // it (e.g. to start typing a pill into an empty field).
  const [override, setOverride] = useState<boolean | null>(null);
  const isExpr = override ?? isTemplate(value);

  const toExpr = (): void => {
    setOverride(true);
    // Preserve a literal value as text so it isn't lost; a number becomes its
    // string form (the templatable schema coerces it back).
    if (typeof value === 'number') onChange(String(value));
  };
  const toLiteral = (): void => {
    setOverride(false);
    // A template can't be a literal number/enum — clear it so the native input
    // starts blank rather than showing a broken value.
    if (isTemplate(value)) onChange(undefined);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={fieldId} label={label} required={required} help={help} />
        <button
          type="button"
          data-testid={`${testId}-fx-toggle`}
          aria-pressed={isExpr}
          title={isExpr ? 'Switch to a fixed value' : 'Switch to an expression (use data pills)'}
          onClick={() => (isExpr ? toLiteral() : toExpr())}
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
            'border focus:outline-none focus:ring-1 focus:ring-accent-teal',
            isExpr
              ? 'border-accent-teal bg-accent-teal/15 text-accent-teal'
              : 'border-white/10 text-text-muted hover:text-text-secondary',
          )}
        >
          fx
        </button>
      </div>

      {isExpr ? (
        <DataPillInput
          id={fieldId}
          nodeId={nodeId}
          value={asString(value)}
          placeholder={placeholder}
          onChange={(next) => onChange(next || undefined)}
        />
      ) : kind === 'select' ? (
        <select
          id={fieldId}
          value={asString(value)}
          onChange={(e) => onChange(e.target.value || undefined)}
          className={inputClass}
        >
          <option value="">— Select —</option>
          {(options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : kind === 'number' ? (
        <input
          id={fieldId}
          type="number"
          value={asNumberString(value)}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          className={inputClass}
        />
      ) : multiline ? (
        <textarea
          id={fieldId}
          value={asString(value)}
          rows={4}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value || undefined)}
          className={inputClass}
        />
      ) : (
        <input
          id={fieldId}
          type="text"
          value={asString(value)}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value || undefined)}
          className={inputClass}
        />
      )}

      {issue && (
        <p data-testid={`${testId}-error`} role="alert" className="text-xs text-red-400">
          {issue}
        </p>
      )}
    </div>
  );
}
