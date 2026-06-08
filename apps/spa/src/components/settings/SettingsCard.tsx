import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface SettingsCardProps {
  title: string;
  description?: string;
  /** Render the card with the danger accent (red border) for destructive sections. */
  danger?: boolean;
  children: ReactNode;
}

/**
 * Sectioned card used by the Settings page. Matches the surface/elevated design
 * tokens used across the app (e.g. EnvVarsManager, ConnectionsPage).
 */
export function SettingsCard({
  title,
  description,
  danger = false,
  children,
}: SettingsCardProps): JSX.Element {
  return (
    <section
      aria-label={title}
      className={cn(
        'rounded-lg border bg-surface p-5 shadow-xl',
        danger ? 'border-feedback-error/40' : 'border-white/5',
      )}
    >
      <header className="mb-4">
        <h2
          className={cn(
            'text-sm font-semibold uppercase tracking-wide',
            danger ? 'text-feedback-error' : 'text-text-secondary',
          )}
        >
          {title}
        </h2>
        {description && <p className="mt-1 text-sm text-text-secondary">{description}</p>}
      </header>
      {children}
    </section>
  );
}
