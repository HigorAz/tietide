import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayCircle, LayoutTemplate, Compass, Waves, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useOnboardingStore, FIRST_ACCESS_TOUR_ID } from '@/stores/onboardingStore';
import { isWelcomeSeen, markWelcomeSeen, isTourCompleted } from '@/utils/tourStorage';
import { Modal } from '@/components/dashboard/Modal';
import { cn } from '@/utils/cn';

const TITLE_ID = 'welcome-modal-title';

/**
 * First-login welcome screen. Greets a brand-new user once, then offers three
 * paths: take the guided tour, jump to templates, or explore alone. It is the
 * single entry point to the first-access tour (AppTour no longer auto-starts).
 * Reopenable later from the Help hub ("Restart onboarding").
 */
export function WelcomeModal(): JSX.Element | null {
  const userId = useAuthStore((s) => s.user?.id);
  const open = useOnboardingStore((s) => s.welcomeOpen);
  const openWelcome = useOnboardingStore((s) => s.openWelcome);
  const closeWelcome = useOnboardingStore((s) => s.closeWelcome);
  const startTour = useOnboardingStore((s) => s.startTour);
  const navigate = useNavigate();

  // Auto-open once on first login. Legacy users who already finished onboarding
  // (completion flag set) are never shown the welcome screen retroactively.
  const autoOpenAttempted = useRef(false);
  useEffect(() => {
    if (!userId) return;
    if (autoOpenAttempted.current) return;
    autoOpenAttempted.current = true;
    if (isWelcomeSeen(userId) || isTourCompleted(userId)) return;
    openWelcome();
  }, [userId, openWelcome]);

  if (!open || !userId) return null;

  const dismiss = (): void => {
    markWelcomeSeen(userId);
    closeWelcome();
  };

  const handleTakeTour = (): void => {
    dismiss();
    startTour({ tourId: FIRST_ACCESS_TOUR_ID });
  };

  const handleTemplate = (): void => {
    dismiss();
    navigate('/library');
  };

  return (
    <Modal onClose={dismiss} titleId={TITLE_ID} className="max-w-lg">
      <div className="relative">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute -right-1 -top-1 rounded p-1 text-text-secondary transition hover:bg-white/5 hover:text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-teal"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-teal/15 text-accent-teal">
            <Waves aria-hidden className="h-5 w-5" />
          </span>
          <div>
            <h2 id={TITLE_ID} className="text-lg font-semibold text-text-primary">
              Welcome to TieTide
            </h2>
            <p className="text-sm text-text-secondary">
              Connect your apps and automate the busywork.
            </p>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-text-secondary">
          Build automations by dragging together <span className="text-text-primary">nodes</span> —
          a trigger to start things off, then actions that do the work. Here’s how you’d like to
          begin:
        </p>

        <div className="mt-5 flex flex-col gap-2">
          <WelcomeChoice
            icon={PlayCircle}
            title="Take the guided tour"
            description="A quick walkthrough of the workspace and the editor."
            onClick={handleTakeTour}
            primary
          />
          <WelcomeChoice
            icon={LayoutTemplate}
            title="Start from a template"
            description="Clone a ready-made workflow and tweak it."
            onClick={handleTemplate}
          />
          <WelcomeChoice
            icon={Compass}
            title="Explore on my own"
            description="Dismiss this and look around. You can restart onboarding from Help anytime."
            onClick={dismiss}
          />
        </div>
      </div>
    </Modal>
  );
}

interface WelcomeChoiceProps {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
  primary?: boolean;
}

function WelcomeChoice({
  icon: Icon,
  title,
  description,
  onClick,
  primary,
}: WelcomeChoiceProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 rounded-md border px-3 py-3 text-left transition',
        'focus:outline-none focus:ring-1 focus:ring-accent-teal',
        primary
          ? 'border-accent-teal/50 bg-accent-teal/10 hover:bg-accent-teal/15'
          : 'border-white/5 bg-elevated hover:border-accent-teal/40 hover:bg-elevated/80',
      )}
    >
      <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-accent-teal" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <p className="mt-0.5 text-xs text-text-secondary">{description}</p>
      </div>
    </button>
  );
}

export default WelcomeModal;
