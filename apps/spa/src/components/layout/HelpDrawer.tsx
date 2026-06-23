import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  Compass,
  ExternalLink,
  Keyboard,
  PlayCircle,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useOnboardingStore } from '@/stores/onboardingStore';
import {
  TOURS,
  TOUR_ORDER,
  getTourIdForRoute,
  type TourDefinition,
  type TourId,
} from '@/components/onboarding/tours';
import { filterConcepts } from '@/components/onboarding/onboardingContent';
import { resetOnboarding } from '@/utils/tourStorage';
import { cn } from '@/utils/cn';

const QUICK_LINKS = [
  { label: 'Documentation', href: 'https://github.com/HigorAz/tietide#readme' },
  { label: 'GitHub', href: 'https://github.com/HigorAz/tietide' },
  { label: 'Contact support', href: 'https://github.com/HigorAz/tietide/issues/new/choose' },
];

const matchesQuery = (text: string, q: string): boolean => text.toLowerCase().includes(q);

export function HelpDrawer(): JSX.Element | null {
  const userId = useAuthStore((s) => s.user?.id);
  const open = useOnboardingStore((s) => s.helpDrawerOpen);
  const close = useOnboardingStore((s) => s.closeHelpDrawer);
  const startTour = useOnboardingStore((s) => s.startTour);
  const finishTour = useOnboardingStore((s) => s.finishTour);
  const openCheatSheet = useOnboardingStore((s) => s.openCheatSheet);
  const openWelcome = useOnboardingStore((s) => s.openWelcome);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [openConcept, setOpenConcept] = useState<string | null>(null);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const currentTourId = getTourIdForRoute(pathname);

  const canLaunch = (tour: TourDefinition): boolean =>
    tour.matchRoute(pathname) || Boolean(tour.navRoute);

  const launchTour = (tour: TourDefinition): void => {
    if (!canLaunch(tour)) return;
    close();
    if (!tour.matchRoute(pathname) && tour.navRoute) navigate(tour.navRoute);
    startTour({ tourId: tour.id });
  };

  const launchTourById = (id: TourId): void => launchTour(TOURS[id]);

  const handleRestart = (): void => {
    // A true restart: wipe the persisted onboarding markers so the welcome
    // screen and per-route auto-tours replay from scratch, not just resurface.
    if (userId) resetOnboarding(userId);
    // Stop any tour already running (older accounts often have a per-route tour
    // auto-started) so the welcome → first-access tour starts from a clean slate
    // instead of swapping steps on a live Joyride instance.
    finishTour();
    close();
    openWelcome();
  };

  const visibleTours = TOUR_ORDER.map((id) => TOURS[id]).filter(
    (t) => !q || matchesQuery(t.label, q),
  );
  const visibleConcepts = filterConcepts(query);

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
        aria-label="Help and learning"
        className={cn(
          'flex h-full w-96 max-w-full flex-col border-l border-white/5 bg-elevated',
          'shadow-2xl shadow-black/40',
        )}
      >
        <header className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Help &amp; learning</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close help"
            className="rounded p-1 text-text-secondary transition hover:bg-white/5 hover:text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-teal"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </header>

        <div className="border-b border-white/5 px-4 py-3">
          <label className="relative flex items-center">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2.5 h-4 w-4 text-text-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tours and concepts…"
              aria-label="Search help"
              className="w-full rounded-md border border-white/5 bg-surface py-2 pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal"
            />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {!q && (
            <div className="space-y-2">
              <ActionRow
                icon={PlayCircle}
                label="Take this page’s tour"
                description={
                  currentTourId
                    ? 'Replay the guided tour for this page.'
                    : 'No tour is available on this page.'
                }
                disabled={!currentTourId}
                onClick={() => currentTourId && launchTourById(currentTourId)}
              />
              <ActionRow
                icon={RotateCcw}
                label="Restart onboarding"
                description="Reopen the welcome screen and getting-started steps."
                onClick={handleRestart}
              />
              <ActionRow
                icon={Keyboard}
                label="Keyboard shortcuts"
                description="Press F8 anywhere to open the cheat sheet."
                onClick={openCheatSheet}
              />
            </div>
          )}

          {visibleTours.length > 0 && (
            <Section title="Guided tours">
              <ul className="space-y-1">
                {visibleTours.map((tour) => {
                  const enabled = canLaunch(tour);
                  return (
                    <li key={tour.id}>
                      <button
                        type="button"
                        disabled={!enabled}
                        onClick={() => launchTour(tour)}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm transition',
                          'focus:outline-none focus:ring-1 focus:ring-accent-teal',
                          enabled
                            ? 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
                            : 'cursor-not-allowed text-text-muted',
                          tour.id === currentTourId && 'text-text-primary',
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <Compass aria-hidden className="h-4 w-4 shrink-0 text-accent-teal" />
                          {tour.label}
                        </span>
                        {tour.id === currentTourId && (
                          <span className="rounded-full bg-accent-teal/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-teal">
                            This page
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {visibleConcepts.length > 0 && (
            <Section title="Concepts">
              <ul className="space-y-1">
                {visibleConcepts.map((concept) => {
                  const expanded = openConcept === concept.id;
                  const tour = concept.tourId ? TOURS[concept.tourId] : undefined;
                  return (
                    <li key={concept.id} className="rounded border border-white/5 bg-surface">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => setOpenConcept(expanded ? null : concept.id)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-teal"
                      >
                        {concept.title}
                        <ChevronDown
                          aria-hidden
                          className={cn(
                            'h-4 w-4 shrink-0 text-text-muted transition-transform',
                            expanded && 'rotate-180',
                          )}
                        />
                      </button>
                      {expanded && (
                        <div className="px-3 pb-3">
                          <p className="text-xs leading-relaxed text-text-secondary">
                            {concept.body}
                          </p>
                          {tour && canLaunch(tour) && (
                            <button
                              type="button"
                              onClick={() => launchTour(tour)}
                              className="mt-2 inline-flex items-center gap-1 rounded text-xs font-medium text-accent-teal transition hover:text-accent-teal-hover focus:outline-none focus:ring-1 focus:ring-accent-teal"
                            >
                              <PlayCircle aria-hidden className="h-3.5 w-3.5" />
                              Show me
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {q && visibleTours.length === 0 && visibleConcepts.length === 0 && (
            <p className="px-1 py-4 text-sm text-text-secondary">No help matches “{query}”.</p>
          )}

          {!q && (
            <Section title="Resources">
              <ul className="space-y-1">
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
            </Section>
          )}
        </div>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="mt-6 first:mt-0">
      <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
        {title}
      </h3>
      <div className="mt-2">{children}</div>
    </div>
  );
}

interface ActionRowProps {
  icon: LucideIcon;
  label: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}

function ActionRow({
  icon: Icon,
  label,
  description,
  onClick,
  disabled,
}: ActionRowProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-start gap-3 rounded border border-white/5 bg-surface px-3 py-3 text-left transition',
        'hover:border-accent-teal/40 hover:bg-elevated focus:outline-none focus:ring-1 focus:ring-accent-teal',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-white/5 disabled:hover:bg-surface',
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
