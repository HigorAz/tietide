import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Joyride, { STATUS, EVENTS, ACTIONS, type CallBackProps, type Step } from 'react-joyride';
import { NodeType, type WorkflowDefinition } from '@tietide/shared';
import { useAuthStore } from '@/stores/authStore';
import { useWorkflowsStore } from '@/stores/workflowsStore';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { isTourCompleted, markTourCompleted } from '@/utils/tourStorage';
import { DASHBOARD_TOUR_STEPS, FIRST_ACCESS_STEPS, getTourSteps, type TourStep } from './tours';

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

const LAST_DASHBOARD_INDEX = DASHBOARD_TOUR_STEPS.length - 1;

export function AppTour(): JSX.Element | null {
  const userId = useAuthStore((s) => s.user?.id);
  const tourRun = useOnboardingStore((s) => s.tourRun);
  const tourScope = useOnboardingStore((s) => s.tourScope);
  const stepIndex = useOnboardingStore((s) => s.tourStepIndex);
  const startTour = useOnboardingStore((s) => s.startTour);
  const finishTour = useOnboardingStore((s) => s.finishTour);
  const setStepIndex = useOnboardingStore((s) => s.setStepIndex);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Auto-start the first-access tour on first login. Once per mount: if the
  // tour ends (finished, skipped, or demo-seed failed), we do NOT re-start
  // — that's what would otherwise happen because finishTour() flips tourRun
  // back to false and would re-trigger this effect.
  const autoStartAttempted = useRef(false);
  useEffect(() => {
    if (!userId) return;
    if (autoStartAttempted.current) return;
    if (isTourCompleted(userId)) return;
    autoStartAttempted.current = true;
    startTour({ scope: 'firstAccess' });
  }, [userId, startTour]);

  if (!userId) return null;

  const steps: TourStep[] =
    tourScope === 'firstAccess' ? FIRST_ACCESS_STEPS : getTourSteps(pathname);

  const completeTour = (): void => {
    markTourCompleted(userId);
    finishTour();
  };

  const handleDashboardToEditorTransition = async (): Promise<void> => {
    const store = useWorkflowsStore.getState();
    try {
      let target = store.workflows[0];
      if (!target) {
        target = await store.create(DEMO_WORKFLOW_BODY);
      }
      navigate(`/workflows/${target.id}`);
      setStepIndex(DASHBOARD_TOUR_STEPS.length);
    } catch {
      // Demo seeding failed — abort the tour but DO NOT persist the
      // completion flag, so the user gets another chance next session.
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
      tourScope === 'firstAccess' &&
      type === EVENTS.STEP_AFTER &&
      action === ACTIONS.NEXT &&
      index === LAST_DASHBOARD_INDEX
    ) {
      void handleDashboardToEditorTransition();
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
