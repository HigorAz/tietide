import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useGettingStarted } from './useGettingStarted';
import { useAuthStore } from '@/stores/authStore';
import { useWorkflowsStore } from '@/stores/workflowsStore';
import { useConnectionsStore } from '@/stores/connectionsStore';
import { useExecutionsStore } from '@/stores/executionsStore';
import { markTourCompleted, markLibraryVisited, isChecklistDismissed } from '@/utils/tourStorage';
import type { WorkflowListItem } from '@/api/workflows';
import type { ConnectionView } from '@/api/connections';
import type { WorkflowExecution } from '@tietide/shared';

const fakeWorkflow = (): WorkflowListItem =>
  ({ id: 'w1', name: 'W' }) as unknown as WorkflowListItem;
const fakeConnection = (): ConnectionView => ({ id: 'c1', name: 'C' }) as unknown as ConnectionView;
const fakeExecution = (): WorkflowExecution => ({ id: 'e1' }) as unknown as WorkflowExecution;

const mockUser = (id: string | null): void => {
  useAuthStore.setState({
    user: id
      ? {
          id,
          email: 't@t',
          name: 'T',
          role: 'USER',
          emailVerified: true,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        }
      : null,
    token: id ? 'jwt' : null,
  });
};

describe('useGettingStarted', () => {
  beforeEach(() => {
    localStorage.clear();
    mockUser('u-1');
    useWorkflowsStore.setState({ workflows: [] });
    useExecutionsStore.setState({ list: [] });
    // status 'ready' so the hook does not trigger a fetch by default.
    useConnectionsStore.setState({ connections: [], status: 'ready', fetch: vi.fn() });
  });

  it('exposes 5 milestones, all incomplete for a brand-new user', () => {
    const { result } = renderHook(() => useGettingStarted());
    expect(result.current.total).toBe(5);
    expect(result.current.completedCount).toBe(0);
    expect(result.current.allDone).toBe(false);
  });

  it('marks the workflow milestone done when a workflow exists', () => {
    useWorkflowsStore.setState({ workflows: [fakeWorkflow()] });
    const { result } = renderHook(() => useGettingStarted());
    expect(result.current.items.find((i) => i.id === 'workflow')?.done).toBe(true);
  });

  it('marks the connection milestone done when a connection exists', () => {
    useConnectionsStore.setState({ connections: [fakeConnection()], status: 'ready' });
    const { result } = renderHook(() => useGettingStarted());
    expect(result.current.items.find((i) => i.id === 'connection')?.done).toBe(true);
  });

  it('marks the run milestone done when an execution exists', () => {
    useExecutionsStore.setState({ list: [fakeExecution()] });
    const { result } = renderHook(() => useGettingStarted());
    expect(result.current.items.find((i) => i.id === 'run')?.done).toBe(true);
  });

  it('marks the tour and library milestones done from localStorage flags', () => {
    markTourCompleted('u-1');
    markLibraryVisited('u-1');
    const { result } = renderHook(() => useGettingStarted());
    expect(result.current.items.find((i) => i.id === 'tour')?.done).toBe(true);
    expect(result.current.items.find((i) => i.id === 'library')?.done).toBe(true);
  });

  it('reaches allDone when every milestone is satisfied', () => {
    markTourCompleted('u-1');
    markLibraryVisited('u-1');
    useWorkflowsStore.setState({ workflows: [fakeWorkflow()] });
    useConnectionsStore.setState({ connections: [fakeConnection()], status: 'ready' });
    useExecutionsStore.setState({ list: [fakeExecution()] });
    const { result } = renderHook(() => useGettingStarted());
    expect(result.current.completedCount).toBe(5);
    expect(result.current.allDone).toBe(true);
  });

  it('dismiss() persists the flag and flips dismissed', () => {
    const { result } = renderHook(() => useGettingStarted());
    expect(result.current.dismissed).toBe(false);
    act(() => result.current.dismiss());
    expect(result.current.dismissed).toBe(true);
    expect(isChecklistDismissed('u-1')).toBe(true);
  });

  it('fetches connections when their store is still idle', async () => {
    const fetch = vi.fn().mockResolvedValue(undefined);
    useConnectionsStore.setState({ connections: [], status: 'idle', fetch });
    renderHook(() => useGettingStarted());
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });
});
