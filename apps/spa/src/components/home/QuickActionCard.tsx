import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface QuickActionCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}

export function QuickActionCard({
  icon: Icon,
  title,
  description,
  onClick,
}: QuickActionCardProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-full flex-col items-start gap-3 rounded-lg border border-white/5 bg-surface p-5 text-left transition',
        'hover:border-accent-teal/40 hover:bg-elevated focus:outline-none focus:ring-1 focus:ring-accent-teal',
      )}
    >
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-accent-teal/15 text-accent-teal">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div>
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <p className="mt-1 text-xs text-text-secondary">{description}</p>
      </div>
    </button>
  );
}
