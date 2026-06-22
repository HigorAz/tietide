import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import type * as ReactRouterDom from 'react-router-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// react-joyride mock — capture the latest props so tests can assert on them
// and synthesise callback events without rendering joyride internals.
type JoyrideMockProps = {
  run: boolean;
  steps: unknown[];
  stepIndex: number;
  callback: (data: unknown) => void;
};
let lastJoyrideProps: JoyrideMockProps | null = null;

vi.mock('react-joyride', () => ({
  default: (props: JoyrideMockProps) => {
    lastJoyrideProps = props;
    return null;
  },
  STATUS: { FINISHED: 'finished', SKIPPED: 'skipped', RUNNING: 'running' },
  ACTIONS: {
    NEXT: 'next',
    PREV: 'prev',
    SKIP: 'skip',
    CLOSE: 'close',
    UPDATE: 'update',
    START: 'start',
  },
  EVENTS: {
    STEP_AFTER: 'step:after',
    TOUR_END: 'tour:end',
    TARGET_NOT_FOUND: 'error:target_not_found',
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof ReactRouterDom;
  return { ...actual, useNavigate: () => mockNavigate };
});

// The element-ready gate is exercised in its own unit (useElementReady.test.ts).
// Here we render AppTour in isolation (no page DOM), so the real gate would hold
// `run` false until its fail-safe timeout. Mock it with a controllable value so
// these tests focus on tour orchestration; one test flips it to assert wiring.
let elementReady = true;
vi.mock('@/hooks/useElementReady', () => ({
  useElementReady: () => elementReady,
}));

import { AppTour } from './AppTour';
import { useAuthStore } from '@/stores/authStore';
import { useWorkflowsStore } from '@/stores/workflowsStore';
import { useEditorStore } from '@/stores/editorStore';
import { useOnboardingStore, initialOnboardingState } from '@/stores/onboardingStore';
import { tourCompletedKey, isTourSeen, markTourSeen } from '@/utils/tourStorage';
import { FIRST_ACCESS_STEPS, FIRST_ACCESS_EDITOR_START, EDITOR_TOUR_STEPS } from './tours';

const SAMPLE_WORKFLOW_NAME = 'Tour demo — Email triage';

const renderAt = (initial = '/'): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="*" element={<AppTour />} />
      </Routes>
    </MemoryRouter>,
  );

const mockUser = (id: string): void => {
  useAuthStore.setState({
    user: {
      id,
      email: 't@t',
      name: 'T',
      role: 'USER',
      emailVerified: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
    token: 'jwt-test',
  });
};

const fireCallback = (data: Record<string, unknown>): void => {
  if (!lastJoyrideProps) throw new Error('Joyride mock has not been rendered yet');
  act(() => {
    lastJoyrideProps!.callback(data);
  });
};

// The first-access tour is launched by the WelcomeModal, not auto-started by
// AppTour — tests start it explicitly to exercise the running/transition logic.
const startFirstAccess = (): void => {
  act(() => {
    useOnboardingStore.getState().startTour({ tourId: 'firstAccess' });
  });
};

describe('AppTour', () => {
  beforeEach(() => {
    lastJoyrideProps = null;
    elementReady = true;
    mockNavigate.mockClear();
    localStorage.clear();
    useAuthStore.setState({ user: null, token: null });
    useOnboardingStore.setState(initialOnboardingState);
    useWorkflowsStore.setState({
      workflows: [],
      status: 'ready',
      error: null,
      fetch: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({
        id: 'wf-new',
        userId: 'u-1',
        name: 'Tour demo',
        description: null,
        definition: { nodes: [], edges: [] },
        isActive: false,
        version: 1,
        executionCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      remove: vi.fn(),
      toggleActive: vi.fn(),
    });
  });

  describe('first-access tour (launched from WelcomeModal)', () => {
    it('should run FIRST_ACCESS_STEPS once started', async () => {
      mockUser('u-1');
      renderAt();
      startFirstAccess();
      await waitFor(() => {
        expect(lastJoyrideProps?.run).toBe(true);
      });
      expect(useOnboardingStore.getState().activeTourId).toBe('firstAccess');
      expect(lastJoyrideProps?.steps).toEqual(FIRST_ACCESS_STEPS);
    });

    it('should NOT auto-start any tour on its own (entry is the welcome modal)', async () => {
      mockUser('u-1'); // no completion flag, fresh user
      // A route with no tour, so per-route auto-start cannot fire either.
      renderAt('/settings');
      await act(async () => {
        await Promise.resolve();
      });
      expect(lastJoyrideProps?.run).toBe(false);
      expect(useOnboardingStore.getState().tourRun).toBe(false);
    });

    it('should not run when no user is loaded yet (auth not hydrated)', async () => {
      renderAt();
      await act(async () => {
        await Promise.resolve();
      });
      expect(useOnboardingStore.getState().tourRun).toBe(false);
    });
  });

  describe('completion persistence', () => {
    it('should persist the flag under exactly `tietide-tour-completed-{userId}` when finished', async () => {
      mockUser('u-1');
      renderAt();
      startFirstAccess();
      await waitFor(() => expect(lastJoyrideProps?.run).toBe(true));
      fireCallback({ status: 'finished', type: 'tour:end', action: 'next', index: 4 });
      expect(localStorage.getItem('tietide-tour-completed-u-1')).not.toBeNull();
      expect(useOnboardingStore.getState().tourRun).toBe(false);
    });

    it('should mark the editor tour seen so it does not auto-replay after onboarding', async () => {
      mockUser('u-1');
      renderAt();
      startFirstAccess();
      await waitFor(() => expect(lastJoyrideProps?.run).toBe(true));
      fireCallback({ status: 'finished', type: 'tour:end', action: 'next', index: 4 });
      expect(isTourSeen('u-1', 'editor')).toBe(true);
    });

    it('should persist the flag when the tour is dismissed mid-way (skipped)', async () => {
      mockUser('u-1');
      renderAt();
      startFirstAccess();
      await waitFor(() => expect(lastJoyrideProps?.run).toBe(true));
      fireCallback({ status: 'skipped', type: 'tour:end', action: 'skip', index: 1 });
      expect(localStorage.getItem('tietide-tour-completed-u-1')).not.toBeNull();
      expect(useOnboardingStore.getState().tourRun).toBe(false);
    });
  });

  describe('first-access → editor transition', () => {
    const transitionIndex = FIRST_ACCESS_EDITOR_START - 1;

    it('should auto-create a demo workflow and navigate when the user has none', async () => {
      mockUser('u-1');
      const create = useWorkflowsStore.getState().create as ReturnType<typeof vi.fn>;
      renderAt();
      startFirstAccess();
      await waitFor(() => expect(lastJoyrideProps?.run).toBe(true));

      fireCallback({
        status: 'running',
        type: 'step:after',
        action: 'next',
        index: transitionIndex,
        lifecycle: 'complete',
      });

      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      expect(mockNavigate).toHaveBeenCalledWith('/workflows/wf-new');
    });

    it('should reuse the existing demo workflow without seeding a duplicate', async () => {
      mockUser('u-1');
      const create = vi.fn();
      useWorkflowsStore.setState({
        workflows: [
          {
            id: 'wf-demo',
            userId: 'u-1',
            name: SAMPLE_WORKFLOW_NAME,
            description: null,
            isActive: false,
            version: 1,
            executionCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            documentation: null,
            folderId: null,
            tags: [],
          },
        ],
        create,
      });

      renderAt();
      startFirstAccess();
      await waitFor(() => expect(lastJoyrideProps?.run).toBe(true));
      fireCallback({
        status: 'running',
        type: 'step:after',
        action: 'next',
        index: transitionIndex,
        lifecycle: 'complete',
      });

      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/workflows/wf-demo'));
      expect(create).not.toHaveBeenCalled();
    });

    it('should seed a new demo when no prior demo workflow exists', async () => {
      mockUser('u-1');
      const create = useWorkflowsStore.getState().create as ReturnType<typeof vi.fn>;
      // An unrelated workflow exists, but not the named demo — so it must create.
      useWorkflowsStore.setState({
        workflows: [
          {
            id: 'wf-other',
            userId: 'u-1',
            name: 'My real workflow',
            description: null,
            isActive: false,
            version: 1,
            executionCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            documentation: null,
            folderId: null,
            tags: [],
          },
        ],
      });

      renderAt();
      startFirstAccess();
      await waitFor(() => expect(lastJoyrideProps?.run).toBe(true));
      fireCallback({
        status: 'running',
        type: 'step:after',
        action: 'next',
        index: transitionIndex,
        lifecycle: 'complete',
      });

      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      expect(mockNavigate).toHaveBeenCalledWith('/workflows/wf-new');
    });

    it('should abort the tour without persisting if seeding a demo workflow fails', async () => {
      mockUser('u-1');
      useWorkflowsStore.setState({
        workflows: [],
        create: vi.fn().mockRejectedValue(new Error('network down')),
      });

      renderAt();
      startFirstAccess();
      await waitFor(() => expect(lastJoyrideProps?.run).toBe(true));
      fireCallback({
        status: 'running',
        type: 'step:after',
        action: 'next',
        index: transitionIndex,
        lifecycle: 'complete',
      });

      await waitFor(() => expect(useOnboardingStore.getState().tourRun).toBe(false));
      expect(localStorage.getItem('tietide-tour-completed-u-1')).toBeNull();
    });
  });

  describe('element-ready gate', () => {
    it('keeps Joyride off while the step target is not yet in the DOM', async () => {
      elementReady = false;
      mockUser('u-1');
      renderAt();
      startFirstAccess();
      await act(async () => {
        await Promise.resolve();
      });
      // The store says the tour is running, but Joyride stays gated off until the
      // target mounts — this is what stops a step from anchoring on the old page.
      expect(useOnboardingStore.getState().tourRun).toBe(true);
      expect(lastJoyrideProps?.run).toBe(false);
    });
  });

  describe('per-step navigation', () => {
    it('navigates to a step’s route so the page shows behind the tooltip', async () => {
      mockUser('u-1');
      renderAt('/settings'); // start off the first step's route
      startFirstAccess();
      // First step lives on '/', so the tour drives the user there.
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
    });

    it('selects the seeded node when entering a config-panel step', async () => {
      const selectNode = vi.fn();
      useEditorStore.setState({ selectNode });
      mockUser('u-1');
      renderAt('/workflows/wf-demo');
      startFirstAccess();

      const idx = FIRST_ACCESS_STEPS.findIndex((s) => s.selectNodeId);
      expect(idx).toBeGreaterThanOrEqual(0);
      act(() => {
        useOnboardingStore.getState().setStepIndex(idx);
      });

      await waitFor(() =>
        expect(selectNode).toHaveBeenCalledWith(FIRST_ACCESS_STEPS[idx].selectNodeId),
      );
    });
  });

  describe('named tour (HelpDrawer "Take the tour")', () => {
    it('should run the editor tour when started by id, regardless of route', async () => {
      mockUser('u-1');
      localStorage.setItem(tourCompletedKey('u-1'), '1'); // first-access already done
      renderAt('/settings');
      act(() => {
        useOnboardingStore.getState().startTour({ tourId: 'editor' });
      });
      await waitFor(() => expect(lastJoyrideProps?.run).toBe(true));
      expect(lastJoyrideProps?.steps).toEqual(EDITOR_TOUR_STEPS);
    });

    it('should end cleanly without touching the first-access completion flag', async () => {
      mockUser('u-1');
      localStorage.setItem(tourCompletedKey('u-1'), '1');
      renderAt('/settings');
      act(() => {
        useOnboardingStore.getState().startTour({ tourId: 'editor' });
      });
      await waitFor(() => expect(lastJoyrideProps?.run).toBe(true));
      fireCallback({ status: 'finished', type: 'tour:end', action: 'next', index: 9 });
      expect(useOnboardingStore.getState().tourRun).toBe(false);
      expect(useOnboardingStore.getState().activeTourId).toBeNull();
    });
  });

  describe('per-route auto-start (returning users)', () => {
    it('should auto-start a route tour the first time it is visited', async () => {
      mockUser('u-1');
      localStorage.setItem(tourCompletedKey('u-1'), '1'); // first-access done
      renderAt('/connections');
      await waitFor(() => expect(useOnboardingStore.getState().activeTourId).toBe('connections'));
      expect(lastJoyrideProps?.run).toBe(true);
      expect(isTourSeen('u-1', 'connections')).toBe(true);
    });

    it('should NOT auto-start a route tour that has already been seen', async () => {
      mockUser('u-1');
      localStorage.setItem(tourCompletedKey('u-1'), '1');
      markTourSeen('u-1', 'connections');
      renderAt('/connections');
      await act(async () => {
        await Promise.resolve();
      });
      expect(useOnboardingStore.getState().tourRun).toBe(false);
    });

    it('should NOT auto-start while the welcome modal is open', async () => {
      mockUser('u-1');
      localStorage.setItem(tourCompletedKey('u-1'), '1');
      useOnboardingStore.setState({ welcomeOpen: true });
      renderAt('/connections');
      await act(async () => {
        await Promise.resolve();
      });
      expect(useOnboardingStore.getState().tourRun).toBe(false);
    });

    it('should NOT auto-start a route tour before onboarding is completed', async () => {
      mockUser('u-1'); // no completion flag → welcome modal owns the experience
      renderAt('/connections');
      await act(async () => {
        await Promise.resolve();
      });
      expect(useOnboardingStore.getState().tourRun).toBe(false);
      expect(isTourSeen('u-1', 'connections')).toBe(false);
    });
  });
});
