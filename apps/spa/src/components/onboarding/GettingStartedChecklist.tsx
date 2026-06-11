import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, X, ArrowRight } from 'lucide-react';
import { useOnboardingStore, FIRST_ACCESS_TOUR_ID } from '@/stores/onboardingStore';
import { useGettingStarted, type GettingStartedItem } from '@/hooks/useGettingStarted';
import { cn } from '@/utils/cn';

/**
 * Home-page activation checklist. Tracks the five first-run milestones and
 * auto-hides once they're all done or the user dismisses it. Reopenable later
 * from the Help hub. Anchored with `data-tour="getting-started"` for the home
 * tour.
 */
export function GettingStartedChecklist(): JSX.Element | null {
  const { items, completedCount, total, allDone, dismissed, dismiss } = useGettingStarted();
  const startTour = useOnboardingStore((s) => s.startTour);
  const navigate = useNavigate();

  if (dismissed || allDone) return null;

  const handleAction = (item: GettingStartedItem): void => {
    if (item.done) return;
    if (item.action === 'tour') {
      startTour({ tourId: FIRST_ACCESS_TOUR_ID });
      return;
    }
    if (item.to) navigate(item.to);
  };

  const pct = Math.round((completedCount / total) * 100);

  return (
    <section
      data-tour="getting-started"
      aria-label="Getting started"
      className="rounded-lg border border-white/5 bg-surface p-5"
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Getting started</h2>
          <p className="mt-0.5 text-xs text-text-secondary">
            {completedCount} of {total} done — finish setup to get the most out of TieTide.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss getting started"
          className="rounded p-1 text-text-secondary transition hover:bg-white/5 hover:text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-teal"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </header>

      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-elevated"
        role="progressbar"
        aria-valuenow={completedCount}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div
          className="h-full rounded-full bg-accent-teal transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="mt-4 flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => handleAction(item)}
              disabled={item.done}
              className={cn(
                'group flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition',
                item.done
                  ? 'cursor-default'
                  : 'hover:bg-elevated focus:outline-none focus:ring-1 focus:ring-accent-teal',
              )}
            >
              {item.done ? (
                <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0 text-success" />
              ) : (
                <Circle aria-hidden className="h-4 w-4 shrink-0 text-text-muted" />
              )}
              <span
                className={cn(
                  'flex-1 text-sm',
                  item.done ? 'text-text-muted line-through' : 'text-text-primary',
                )}
              >
                {item.label}
              </span>
              {!item.done && (
                <ArrowRight
                  aria-hidden
                  className="h-4 w-4 shrink-0 text-text-muted transition group-hover:text-accent-teal"
                />
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default GettingStartedChecklist;
