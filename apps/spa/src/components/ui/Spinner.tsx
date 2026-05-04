import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

export type SpinnerSize = 'sm' | 'md' | 'lg';

interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
  label?: string;
}

const SIZE_PX: Record<SpinnerSize, number> = {
  sm: 16,
  md: 20,
  lg: 24,
};

export function Spinner({ size = 'sm', className, label = 'Loading' }: SpinnerProps): JSX.Element {
  return (
    <span
      role="status"
      data-testid="spinner"
      className={cn('inline-flex items-center justify-center text-current', className)}
    >
      <Loader2 size={SIZE_PX[size]} className="animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}
