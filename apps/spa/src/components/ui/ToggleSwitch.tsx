import { cn } from '@/utils/cn';

export interface ToggleSwitchProps {
  id?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  /** One-line sub-description rendered beneath the label (per sketch 003-D). */
  description?: string;
  disabled?: boolean;
  'data-testid'?: string;
}

/**
 * Boolean setting rendered as a 32×18 sliding-pill toggle (teal when on).
 * Plain styled button — Radix Switch is intentionally NOT used (not installed).
 */
export function ToggleSwitch({
  id,
  checked,
  onChange,
  label,
  description,
  disabled = false,
  'data-testid': dataTestId,
}: ToggleSwitchProps): JSX.Element {
  const toggle = (): void => {
    if (!disabled) onChange(!checked);
  };

  return (
    <label
      className={cn(
        'flex items-start gap-3',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      )}
    >
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        data-testid={dataTestId}
        onClick={toggle}
        className={cn(
          'relative mt-0.5 h-[18px] w-8 shrink-0 rounded-full border transition-colors',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-teal',
          checked ? 'border-transparent bg-accent-teal/30' : 'border-white/10 bg-elevated',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-transform',
            checked ? 'translate-x-[14px] bg-accent-teal' : 'translate-x-0.5 bg-text-secondary',
          )}
        />
      </button>
      <span className="flex flex-col">
        <span className="text-xs font-medium text-text-primary">{label}</span>
        {description && <span className="block text-xs text-text-muted">{description}</span>}
      </span>
    </label>
  );
}
