import { useLocation } from 'react-router-dom';
import { ExternalLink, Keyboard, PlayCircle, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { getTourIdForRoute, hasTourForRoute } from '@/components/onboarding/tours';
import { cn } from '@/utils/cn';

const QUICK_LINKS = [
  { label: 'Documentation', href: 'https://github.com/HigorAz/tietide#readme' },
  { label: 'GitHub', href: 'https://github.com/HigorAz/tietide' },
  { label: 'Contact support', href: 'https://github.com/HigorAz/tietide/issues/new/choose' },
];

export function HelpDrawer(): JSX.Element | null {
  const open = useOnboardingStore((s) => s.helpDrawerOpen);
  const close = useOnboardingStore((s) => s.closeHelpDrawer);
  const startTour = useOnboardingStore((s) => s.startTour);
  const openCheatSheet = useOnboardingStore((s) => s.openCheatSheet);
  const { pathname } = useLocation();

  if (!open) return null;

  const tourAvailable = hasTourForRoute(pathname);

  const handleTakeTour = (): void => {
    const tourId = getTourIdForRoute(pathname);
    if (!tourId) return;
    close();
    startTour({ tourId });
  };

  const handleShortcuts = (): void => {
    openCheatSheet();
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div
        data-testid="help-drawer-backdrop"
        aria-hidden
        onClick={close}
        className="flex-1 bg-deep-blue/60"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Help"
        className={cn(
          'flex h-full w-80 max-w-full flex-col border-l border-white/5 bg-elevated',
          'shadow-2xl shadow-black/40',
        )}
      >
        <header className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Help</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close help"
            className="rounded p-1 text-text-secondary transition hover:bg-white/5 hover:text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-teal"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <PrimaryAction
            icon={PlayCircle}
            label="Take the tour"
            description={
              tourAvailable
                ? 'Replay the guided tour for this page.'
                : 'No tour is available on this page.'
            }
            disabled={!tourAvailable}
            onClick={handleTakeTour}
          />

          <PrimaryAction
            icon={Keyboard}
            label="Keyboard shortcuts"
            description="Press F8 anywhere to open the cheat sheet."
            onClick={handleShortcuts}
            className="mt-2"
          />

          <div className="mt-6">
            <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Resources
            </h3>
            <ul className="mt-2 space-y-1">
              {QUICK_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded px-3 py-2 text-sm text-text-secondary transition hover:bg-white/5 hover:text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-teal"
                  >
                    <span>{link.label}</span>
                    <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>
    </div>
  );
}

interface PrimaryActionProps {
  icon: LucideIcon;
  label: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

function PrimaryAction({
  icon: Icon,
  label,
  description,
  onClick,
  disabled,
  className,
}: PrimaryActionProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-start gap-3 rounded border border-white/5 bg-surface px-3 py-3 text-left transition',
        'hover:border-accent-teal/40 hover:bg-elevated focus:outline-none focus:ring-1 focus:ring-accent-teal',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-white/5 disabled:hover:bg-surface',
        className,
      )}
    >
      <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent-teal" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <p className="mt-0.5 text-xs text-text-secondary">{description}</p>
      </div>
    </button>
  );
}

export default HelpDrawer;
