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

import { AppTour } from './AppTour';
import { useAuthStore } from '@/stores/authStore';
import { useWorkflowsStore } from '@/stores/workflowsStore';
import { useOnboardingStore, initialOnboardingState } from '@/stores/onboardingStore';
import { tourCompletedKey } from '@/utils/tourStorage';
import { DASHBOARD_TOUR_STEPS, FIRST_ACCESS_STEPS } from './tours';

const renderAt = (initial = '/dashboard'): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="*" element={<AppTour />} />
      </Routes>
    </MemoryRouter>,
  );

const mockUser = (id: string): void => {
  useAuthStore.setState({
    user: { id, email: 't@t', name: 'T', role: 'USER' },
    token: 'jwt-test',
  });
};

const fireCallback = (data: Record<string, unknown>): void => {
  if (!lastJoyrideProps) throw new Error('Joyride mock has not been rendered yet');
  act(() => {
    lastJoyrideProps!.callback(data);
  });
};

describe('AppTour', () => {
  beforeEach(() => {
    lastJoyrideProps = null;
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

  describe('first-access auto-start', () => {
    it('should fire the tour on first login (no flag in localStorage)', async () => {
      mockUser('u-1');
      renderAt();
      await waitFor(() => {
        expect(lastJoyrideProps?.run).toBe(true);
      });
      expect(useOnboardingStore.getState().tourScope).toBe('firstAccess');
      expect(lastJoyrideProps?.steps).toEqual(FIRST_ACCESS_STEPS);
    });

    it('should NOT fire the tour on subsequent logins (flag persisted)', async () => {
      localStorage.setItem(tourCompletedKey('u-1'), '1');
      mockUser('u-1');
      renderAt();
      // Give the auto-start effect a chance to run if it were going to.
      await act(async () => {
        await Promise.resolve();
      });
      expect(lastJoyrideProps?.run).toBe(false);
      expect(useOnboardingStore.getState().tourRun).toBe(false);
    });

    it('should not start the tour if no user is loaded yet (auth not hydrated)', async () => {
      // user is null
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
      await waitFor(() => expect(lastJoyrideProps?.run).toBe(true));
      fireCallback({ status: 'finished', type: 'tour:end', action: 'next', index: 4 });
      expect(localStorage.getItem('tietide-tour-completed-u-1')).not.toBeNull();
      expect(useOnboardingStore.getState().tourRun).toBe(false);
    });

    it('should persist the flag when the tour is dismissed mid-way (skipped)', async () => {
      mockUser('u-1');
      renderAt();
      await waitFor(() => expect(lastJoyrideProps?.run).toBe(true));
      fireCallback({ status: 'skipped', type: 'tour:end', action: 'skip', index: 1 });
      expect(localStorage.getItem('tietide-tour-completed-u-1')).not.toBeNull();
      expect(useOnboardingStore.getState().tourRun).toBe(false);
    });
  });

  describe('mid-flow dashboard → editor transition', () => {
    it('should auto-create a demo workflow and navigate when the user has none', async () => {
      mockUser('u-1');
      const create = useWorkflowsStore.getState().create as ReturnType<typeof vi.fn>;
      renderAt();
      await waitFor(() => expect(lastJoyrideProps?.run).toBe(true));

      // Simulate the user finishing the last dashboard step (index 2).
      fireCallback({
        status: 'running',
        type: 'step:after',
        action: 'next',
        index: DASHBOARD_TOUR_STEPS.length - 1,
        lifecycle: 'complete',
      });

      await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
      expect(mockNavigate).toHaveBeenCalledWith('/workflows/wf-new');
    });

    it('should navigate to an existing workflow without seeding a demo', async () => {
      mockUser('u-1');
      const create = vi.fn();
      useWorkflowsStore.setState({
        workflows: [
          {
            id: 'wf-existing',
            userId: 'u-1',
            name: 'Existing',
            description: null,
            definition: { nodes: [], edges: [] },
            isActive: false,
            version: 1,
            executionCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        create,
      });

      renderAt();
      await waitFor(() => expect(lastJoyrideProps?.run).toBe(true));
      fireCallback({
        status: 'running',
        type: 'step:after',
        action: 'next',
        index: DASHBOARD_TOUR_STEPS.length - 1,
        lifecycle: 'complete',
      });

      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/workflows/wf-existing'));
      expect(create).not.toHaveBeenCalled();
    });

    it('should abort the tour without persisting if seeding a demo workflow fails', async () => {
      mockUser('u-1');
      useWorkflowsStore.setState({
        workflows: [],
        create: vi.fn().mockRejectedValue(new Error('network down')),
      });

      renderAt();
      await waitFor(() => expect(lastJoyrideProps?.run).toBe(true));
      fireCallback({
        status: 'running',
        type: 'step:after',
        action: 'next',
        index: DASHBOARD_TOUR_STEPS.length - 1,
        lifecycle: 'complete',
      });

      await waitFor(() => expect(useOnboardingStore.getState().tourRun).toBe(false));
      // Crucially, the user can retry next session — flag NOT set.
      expect(localStorage.getItem('tietide-tour-completed-u-1')).toBeNull();
    });
  });

  describe('current-page scope (HelpDrawer "Take the tour")', () => {
    it('should pass the editor steps when scope is currentPage and route is /workflows/:id', async () => {
      mockUser('u-1');
      // Simulate a user who already completed onboarding.
      localStorage.setItem(tourCompletedKey('u-1'), '1');
      renderAt('/workflows/abc');
      // Now they invoke "Take the tour".
      act(() => {
        useOnboardingStore.getState().startTour({ scope: 'currentPage' });
      });
      await waitFor(() => expect(lastJoyrideProps?.run).toBe(true));
      expect(lastJoyrideProps?.steps).toHaveLength(2);
    });

    it('should not run when scope is currentPage on a route without a tour', async () => {
      mockUser('u-1');
      localStorage.setItem(tourCompletedKey('u-1'), '1');
      renderAt('/settings');
      act(() => {
        useOnboardingStore.getState().startTour({ scope: 'currentPage' });
      });
      // Steps array empty → joyride.run should be false even though tourRun=true.
      await waitFor(() => expect(lastJoyrideProps).not.toBeNull());
      expect(lastJoyrideProps?.run).toBe(false);
    });
  });
});
