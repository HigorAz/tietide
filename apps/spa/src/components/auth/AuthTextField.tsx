import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/utils/cn';

interface AuthTextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string;
  /** Renders a show/hide toggle and manages the input's password/text type. */
  isPassword?: boolean;
}

const inputClasses = cn(
  'w-full rounded-md border border-white/5 bg-elevated px-3.5 py-3',
  'text-[15px] text-text-primary placeholder:text-text-muted outline-none transition',
  'focus:border-accent-teal focus:ring-[3px] focus:ring-accent-teal/15',
);
const labelClasses = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-text-secondary';

/**
 * Label + input + inline error, forwarding `react-hook-form` register props.
 * The optional password toggle keeps an accessible name that avoids the word
 * "password" so `getByLabelText(/password/i)` still resolves to the input alone.
 */
export const AuthTextField = forwardRef<HTMLInputElement, AuthTextFieldProps>(
  function AuthTextField({ id, label, error, isPassword, type, className, ...rest }, ref) {
    const [show, setShow] = useState(false);
    const inputType = isPassword ? (show ? 'text' : 'password') : type;

    return (
      <div className="mb-[19px]">
        <label htmlFor={id} className={labelClasses}>
          {label}
        </label>
        <div className="relative">
          <input
            id={id}
            ref={ref}
            type={inputType}
            className={cn(inputClasses, isPassword && 'pr-11', className)}
            aria-invalid={error ? 'true' : 'false'}
            {...rest}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? 'Hide' : 'Show'}
              className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded text-text-secondary transition-colors hover:text-text-primary"
            >
              {show ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
            </button>
          )}
        </div>
        {error && (
          <p className="mt-1 text-xs text-error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);
