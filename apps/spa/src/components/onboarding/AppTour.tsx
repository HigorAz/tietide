import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Joyride, { STATUS, EVENTS, ACTIONS, type CallBackProps, type Step } from 'react-joyride';
import { NodeType, type WorkflowDefinition } from '@tietide/shared';
import { useAuthStore } from '@/stores/authStore';
import { useWorkflowsStore } from '@/stores/workflowsStore';
import { useOnboardingStore, FIRST_ACCESS_TOUR_ID } from '@/stores/onboardingStore';
import { isTourCompleted, markTourCompleted, isTourSeen, markTourSeen } from '@/utils/tourStorage';
import {
  FIRST_ACCESS_STEPS,
  FIRST_ACCESS_EDITOR_START,
  getTour,
  getTourIdForRoute,
  type TourId,
  type TourStep,
} from './tours';

const DEMO_WORKFLOW_DEFINITION: WorkflowDefinition = {
  nodes: [
    {
      id: 'start',
      type: NodeType.MANUAL_TRIGGER,
      name: 'Start',
      position: { x: 80, y: 160 },
      config: {},
    },
  ],
  edges: [],
};

const DEMO_WORKFLOW_BODY = {
  name: 'Tour demo',
  description: 'Created by the onboarding tour to walk you through the editor.',
  definition: DEMO_WORKFLOW_DEFINITION,
};

const JOYRIDE_STYLES = {
  options: {
    zIndex: 60,
    primaryColor: '#00D4B3',
    backgroundColor: '#1A3050',
    textColor: '#F6F8FA',
    arrowColor: '#1A3050',
  },
};

// Tours already covered by the first-access sequence — don't auto-replay them
// the next time the user lands on those routes.
const FIRST_ACCESS_COVERS: TourId[] = ['editor', 'home'];

export function AppTour(): JSX.Element | null {
  const userId = useAuthStore((s) => s.user?.id);
  const tourRun = useOnboardingStore((s) => s.tourRun);
  const activeTourId = useOnboardingStore((s) => s.activeTourId);
  const stepIndex = useOnboardingStore((s) => s.tourStepIndex);
  const welcomeOpen = useOnboardingStore((s) => s.welcomeOpen);
  const startTour = useOnboardingStore((s) => s.startTour);
  const finishTour = useOnboardingStore((s) => s.finishTour);
  const setStepIndex = useOnboardingStore((s) => s.setStepIndex);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // The first-access tour is launched from the WelcomeModal's "Take the tour"
  // CTA (not auto-started here), so a brand-new user is greeted by the welcome
  // screen first and opts in rather than being dropped straight into a tour.

  // For returning users (first-access already done), auto-start a route's tour
  // the first time they visit it. Persisted per-tour so it only fires once.
  const routeTourId = getTourIdForRoute(pathname);
  useEffect(() => {
    if (!userId) return;
    if (!isTourCompleted(userId)) return; // first-access takes priority
    if (welcomeOpen || tourRun || activeTourId) return;
    if (!routeTourId) return;
    if (isTourSeen(userId, routeTourId)) return;
    markTourSeen(userId, routeTourId);
    startTour({ tourId: routeTourId });
  }, [userId, routeTourId, welcomeOpen, tourRun, activeTourId, startTour]);

  if (!userId) return null;

  const isFirstAccess = activeTourId === FIRST_ACCESS_TOUR_ID;
  const steps: TourStep[] = isFirstAccess
    ? FIRST_ACCESS_STEPS
    : activeTourId
      ? (getTour(activeTourId as TourId)?.steps ?? [])
      : [];

  const completeTour = (): void => {
    if (isFirstAccess) {
      markTourCompleted(userId);
      FIRST_ACCESS_COVERS.forEach((id) => markTourSeen(userId, id));
    }
    finishTour();
  };

  const handleTransitionToEditor = async (): Promise<void> => {
    const store = useWorkflowsStore.getState();
    try {
      let target = store.workflows[0];
      if (!target) {
        target = await store.create(DEMO_WORKFLOW_BODY);
      }
      navigate(`/workflows/${target.id}`);
      setStepIndex(FIRST_ACCESS_EDITOR_START);
    } catch {
      // Demo seeding failed — abort the tour but DO NOT persist the completion
      // flag, so the user gets another chance next session.
      finishTour();
    }
  };

  const handleCallback = (data: CallBackProps): void => {
    const { status, type, action, index } = data;

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      completeTour();
      return;
    }

    if (
      isFirstAccess &&
      type === EVENTS.STEP_AFTER &&
      action === ACTIONS.NEXT &&
      index === FIRST_ACCESS_EDITOR_START - 1
    ) {
      void handleTransitionToEditor();
      return;
    }

    if (type === EVENTS.STEP_AFTER) {
      const nextIndex = action === ACTIONS.PREV ? index - 1 : index + 1;
      setStepIndex(nextIndex);
    }
  };

  return (
    <Joyride
      steps={steps as unknown as Step[]}
      run={tourRun && steps.length > 0}
      stepIndex={stepIndex}
      callback={handleCallback}
      continuous
      showProgress
      showSkipButton
      disableScrolling={false}
      // Our scroll container is <main> (the shell is locked to the viewport), not
      // the document. Without this, react-joyride's "scroll parent fix" sets
      // `main.style.overflow = "initial"` whenever the current page isn't
      // overflowing (e.g. the editor, which exactly fills <main>) and never
      // restores it — leaving the next, taller page unscrollable until a reload.
      disableScrollParentFix
      styles={JOYRIDE_STYLES}
      locale={{
        back: 'Back',
        close: 'Close',
        last: 'Done',
        next: 'Next',
        skip: 'Skip',
      }}
    />
  );
}

export default AppTour;
