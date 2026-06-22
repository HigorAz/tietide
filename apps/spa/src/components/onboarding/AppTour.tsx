import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Joyride, { STATUS, EVENTS, ACTIONS, type CallBackProps, type Step } from 'react-joyride';
import { NodeType, type WorkflowDefinition } from '@tietide/shared';
import { useAuthStore } from '@/stores/authStore';
import { useWorkflowsStore } from '@/stores/workflowsStore';
import { useEditorStore } from '@/stores/editorStore';
import { useOnboardingStore, FIRST_ACCESS_TOUR_ID } from '@/stores/onboardingStore';
import { useElementReady } from '@/hooks/useElementReady';
import { isTourCompleted, markTourCompleted, isTourSeen, markTourSeen } from '@/utils/tourStorage';
import {
  FIRST_ACCESS_STEPS,
  FIRST_ACCESS_EDITOR_START,
  getTour,
  getTourIdForRoute,
  type TourId,
  type TourStep,
} from './tours';

// A small but real, recognizable automation seeded for the editor walkthrough:
// email arrives → Ollama categorizes it → the category is added back as a Gmail
// label → a row is appended to a Google Sheet. Node ids are stable so the tour
// can select them to reveal the config panel. Configs are left empty — the nodes
// render as "needs setup", which is exactly what the walkthrough teaches.
const SAMPLE_WORKFLOW_NAME = 'Tour demo — Email triage';

const SAMPLE_WORKFLOW_DEFINITION: WorkflowDefinition = {
  nodes: [
    {
      id: 'trigger',
      type: NodeType.GMAIL_MESSAGE_RECEIVED,
      name: 'Email received',
      position: { x: 80, y: 160 },
      config: {},
    },
    {
      id: 'categorize',
      type: NodeType.OLLAMA_GENERATE,
      name: 'Categorize with Ollama',
      position: { x: 380, y: 160 },
      config: {},
    },
    {
      id: 'label',
      type: NodeType.GMAIL_MODIFY_LABELS,
      name: 'Add Gmail label',
      position: { x: 680, y: 160 },
      config: {},
    },
    {
      id: 'sheet',
      type: NodeType.SHEETS_APPEND,
      name: 'Append row to Sheet',
      position: { x: 980, y: 160 },
      config: {},
    },
  ],
  edges: [
    { id: 'e-trigger-categorize', source: 'trigger', target: 'categorize' },
    { id: 'e-categorize-label', source: 'categorize', target: 'label' },
    { id: 'e-label-sheet', source: 'label', target: 'sheet' },
  ],
};

const SAMPLE_WORKFLOW_BODY = {
  name: SAMPLE_WORKFLOW_NAME,
  description:
    'Created by the onboarding tour: categorize incoming email with Ollama, label it in Gmail, and log it to a Google Sheet.',
  definition: SAMPLE_WORKFLOW_DEFINITION,
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

  const isFirstAccess = activeTourId === FIRST_ACCESS_TOUR_ID;
  const steps: TourStep[] = isFirstAccess
    ? FIRST_ACCESS_STEPS
    : activeTourId
      ? (getTour(activeTourId as TourId)?.steps ?? [])
      : [];
  const currentStep = tourRun ? steps[stepIndex] : undefined;
  const currentRoute = currentStep?.route;
  const currentSelectNodeId = currentStep?.selectNodeId;
  const currentTarget = tourRun ? (currentStep?.target ?? null) : null;

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

  // Per-step navigation: bring the destination page into view behind the
  // tooltip. The element-ready gate below holds `run` until the target mounts,
  // so the step never anchors on the old page mid-navigation.
  useEffect(() => {
    if (!tourRun) return;
    if (currentRoute && currentRoute !== pathname) navigate(currentRoute);
  }, [tourRun, stepIndex, currentRoute, pathname, navigate]);

  // Per-step editor driving: select a node so its (otherwise transient) config
  // panel mounts, giving the "configure" / "data pills" steps a real anchor.
  useEffect(() => {
    if (!tourRun || !currentSelectNodeId) return;
    useEditorStore.getState().selectNode(currentSelectNodeId);
  }, [tourRun, stepIndex, currentSelectNodeId]);

  // Hold Joyride until the current step's target is actually in the DOM (after a
  // route change, or once the editor finishes loading). Fixes steps that would
  // otherwise "disappear" by anchoring before the page renders.
  const targetReady = useElementReady(currentTarget, tourRun);

  if (!userId) return null;

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
      if (store.status === 'idle') {
        await store.fetch();
      }
      // Reuse the single named demo if it already exists (e.g. on a re-run) so
      // repeated tours don't pile up duplicate workflows; otherwise create it.
      const existing = useWorkflowsStore
        .getState()
        .workflows.find((w) => w.name === SAMPLE_WORKFLOW_NAME);
      const target = existing ?? (await store.create(SAMPLE_WORKFLOW_BODY));
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
      run={tourRun && steps.length > 0 && targetReady}
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
