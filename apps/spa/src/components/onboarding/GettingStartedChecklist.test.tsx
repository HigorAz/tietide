import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as ReactRouterDom from 'react-router-dom';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof ReactRouterDom;
  return { ...actual, useNavigate: () => mockNavigate };
});

import { GettingStartedChecklist } from './GettingStartedChecklist';
import { useAuthStore } from '@/stores/authStore';
import { useWorkflowsStore } from '@/stores/workflowsStore';
import { useConnectionsStore } from '@/stores/connectionsStore';
import { useExecutionsStore } from '@/stores/executionsStore';
import { useOnboardingStore, initialOnboardingState } from '@/stores/onboardingStore';
import { markTourCompleted, markLibraryVisited, isChecklistDismissed } from '@/utils/tourStorage';
import type { WorkflowListItem } from '@/api/workflows';

const renderChecklist = (): ReturnType<typeof render> =>
  render(
    <MemoryRouter>
      <GettingStartedChecklist />
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
    token: 'jwt',
  });
};

describe('GettingStartedChecklist', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    localStorage.clear();
    mockUser('u-1');
    useWorkflowsStore.setState({ workflows: [] });
    useExecutionsStore.setState({ list: [] });
    useConnectionsStore.setState({ connections: [], status: 'ready', fetch: vi.fn() });
    useOnboardingStore.setState(initialOnboardingState);
  });

  it('renders the five milestones with progress for a new user', () => {
    renderChecklist();
    expect(screen.getByRole('region', { name: /getting started/i })).toBeInTheDocument();
    expect(screen.getByText(/0 of 5 done/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /take the product tour/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create your first workflow/i })).toBeInTheDocument();
  });

  it('carries the data-tour anchor for the home tour', () => {
    const { container } = renderChecklist();
    expect(container.querySelector('[data-tour="getting-started"]')).not.toBeNull();
  });

  it('starts the first-access tour from the tour milestone', async () => {
    const user = userEvent.setup();
    const startTour = vi.fn();
    useOnboardingStore.setState({ startTour });
    renderChecklist();
    await user.click(screen.getByRole('button', { name: /take the product tour/i }));
    expect(startTour).toHaveBeenCalledWith({ tourId: 'firstAccess' });
  });

  it('navigates when an incomplete milestone is actioned', async () => {
    const user = userEvent.setup();
    renderChecklist();
    await user.click(screen.getByRole('button', { name: /connect an app/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/connections');
  });

  it('reflects completed milestones (done rows are disabled)', () => {
    useWorkflowsStore.setState({
      workflows: [{ id: 'w1', name: 'W' } as unknown as WorkflowListItem],
    });
    renderChecklist();
    expect(screen.getByRole('button', { name: /create your first workflow/i })).toBeDisabled();
  });

  it('dismiss hides the checklist and persists the flag', async () => {
    const user = userEvent.setup();
    const { rerender } = renderChecklist();
    await user.click(screen.getByRole('button', { name: /dismiss getting started/i }));
    expect(isChecklistDismissed('u-1')).toBe(true);
    rerender(
      <MemoryRouter>
        <GettingStartedChecklist />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('region', { name: /getting started/i })).not.toBeInTheDocument();
  });

  it('hides entirely once every milestone is complete', () => {
    markTourCompleted('u-1');
    markLibraryVisited('u-1');
    useWorkflowsStore.setState({
      workflows: [{ id: 'w1', name: 'W' } as unknown as WorkflowListItem],
    });
    useConnectionsStore.setState({
      connections: [{ id: 'c1' } as never],
      status: 'ready',
      fetch: vi.fn(),
    });
    useExecutionsStore.setState({ list: [{ id: 'e1' } as never] });
    renderChecklist();
    expect(screen.queryByRole('region', { name: /getting started/i })).not.toBeInTheDocument();
  });
});
