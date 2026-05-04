import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Workflow } from '@tietide/shared';

function LocationStatePeek(): JSX.Element {
  const location = useLocation();
  const from = (location.state as { from?: unknown } | null)?.from;
  return <div data-testid="peek-from">{typeof from === 'string' ? from : ''}</div>;
}

vi.mock('@/api/workflows', () => ({
  listWorkflows: vi.fn(),
  createWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  toggleWorkflowActive: vi.fn(),
}));

import * as workflowsApi from '@/api/workflows';
import { useWorkflowsStore } from '@/stores/workflowsStore';
import { initialToastState, useToastStore } from '@/stores/toastStore';
import { Toaster } from '@/components/ui/Toaster';
import { WorkflowsPage } from './WorkflowsPage';

const mockedList = vi.mocked(workflowsApi.listWorkflows);
const mockedCreate = vi.mocked(workflowsApi.createWorkflow);
const mockedDelete = vi.mocked(workflowsApi.deleteWorkflow);
const mockedToggle = vi.mocked(workflowsApi.toggleWorkflowActive);

const makeWorkflow = (overrides: Partial<Workflow> = {}): Workflow => ({
  id: 'wf-1',
  name: 'Workflow One',
  description: null,
  definition: { nodes: [], edges: [] },
  isActive: false,
  version: 1,
  userId: 'user-1',
  createdAt: new Date('2026-04-01T12:00:00Z'),
  updatedAt: new Date('2026-04-10T12:00:00Z'),
  executionCount: 0,
  ...overrides,
});

const renderWorkflows = (): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={['/workflows']}>
      <Toaster />
      <Routes>
        <Route path="/workflows" element={<WorkflowsPage />} />
        <Route path="/workflows/:id" element={<div>Editor for workflow</div>} />
      </Routes>
    </MemoryRouter>,
  );

const resetStore = (): void => {
  useWorkflowsStore.setState({ workflows: [], status: 'idle', error: null });
};

describe('WorkflowsPage', () => {
  beforeEach(() => {
    resetStore();
    useToastStore.setState({ ...initialToastState });
    mockedList.mockReset();
    mockedCreate.mockReset();
    mockedDelete.mockReset();
    mockedToggle.mockReset();
  });

  it('fetches and displays workflows (AC1)', async () => {
    mockedList.mockResolvedValueOnce([
      makeWorkflow({ id: 'a', name: 'Alpha' }),
      makeWorkflow({ id: 'b', name: 'Beta' }),
    ]);

    renderWorkflows();

    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledTimes(1);
  });

  it('opens the new workflow modal when Create is clicked (AC2)', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce([]);
    renderWorkflows();

    await user.click(await screen.findByRole('button', { name: /new workflow/i }));

    expect(
      await screen.findByRole('dialog', { name: /create a new workflow/i }),
    ).toBeInTheDocument();
  });

  it('removes a workflow after confirmation (AC3)', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce([makeWorkflow({ id: 'a', name: 'Alpha' })]);
    mockedDelete.mockResolvedValueOnce();

    renderWorkflows();

    await user.click(await screen.findByRole('button', { name: /delete alpha/i }));
    await user.click(await screen.findByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('a'));
    await waitFor(() => expect(screen.queryByText('Alpha')).not.toBeInTheDocument());
  });

  it('renders an empty state with a CTA when there are no workflows', async () => {
    mockedList.mockResolvedValueOnce([]);

    renderWorkflows();

    expect(await screen.findByText(/no workflows yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create your first workflow/i })).toBeInTheDocument();
  });

  it('calls toggleWorkflowActive when the active toggle is clicked', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce([makeWorkflow({ id: 'a', name: 'Alpha', isActive: false })]);
    mockedToggle.mockResolvedValueOnce(makeWorkflow({ id: 'a', name: 'Alpha', isActive: true }));

    renderWorkflows();

    await user.click(await screen.findByRole('switch', { name: /toggle active for alpha/i }));

    await waitFor(() => expect(mockedToggle).toHaveBeenCalledWith('a', true));
  });

  it('navigates to /workflows/:id when a card is opened', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce([makeWorkflow({ id: 'a', name: 'Alpha' })]);

    renderWorkflows();

    await user.click(await screen.findByRole('button', { name: /open alpha/i }));

    expect(await screen.findByText(/editor for workflow/i)).toBeInTheDocument();
  });

  it('passes from=/workflows in location state when opening a workflow (issue #104)', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce([makeWorkflow({ id: 'a', name: 'Alpha' })]);

    render(
      <MemoryRouter initialEntries={['/workflows']}>
        <Toaster />
        <Routes>
          <Route path="/workflows" element={<WorkflowsPage />} />
          <Route path="/workflows/:id" element={<LocationStatePeek />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: /open alpha/i }));

    expect(await screen.findByTestId('peek-from')).toHaveTextContent('/workflows');
  });

  it('passes from=/workflows in location state when creating a workflow (issue #104)', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce([]);
    mockedCreate.mockResolvedValueOnce(makeWorkflow({ id: 'new', name: 'New' }));

    render(
      <MemoryRouter initialEntries={['/workflows']}>
        <Toaster />
        <Routes>
          <Route path="/workflows" element={<WorkflowsPage />} />
          <Route path="/workflows/:id" element={<LocationStatePeek />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: /new workflow/i }));
    await user.type(await screen.findByLabelText(/name/i), 'New');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    expect(await screen.findByTestId('peek-from')).toHaveTextContent('/workflows');
  });

  it('shows an error banner with a retry button when the list request fails', async () => {
    mockedList.mockRejectedValueOnce(new Error('network down'));

    renderWorkflows();

    expect(await screen.findByText(/network down/i)).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: /retry/i });
    mockedList.mockResolvedValueOnce([makeWorkflow({ id: 'a', name: 'Alpha' })]);
    await userEvent.setup().click(retry);
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
  });

  it('shows a toast when the toggle request fails (issue #41)', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce([makeWorkflow({ id: 'a', name: 'Alpha', isActive: false })]);
    mockedToggle.mockRejectedValueOnce(new Error('toggle blew up'));

    renderWorkflows();

    await user.click(await screen.findByRole('switch', { name: /toggle active for alpha/i }));

    expect(await screen.findByText(/toggle blew up/i)).toBeInTheDocument();
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].tone).toBe('error');
  });

  it('shows a toast when the delete request fails (issue #41)', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce([makeWorkflow({ id: 'a', name: 'Alpha' })]);
    mockedDelete.mockRejectedValueOnce(new Error('delete failed'));

    renderWorkflows();

    await user.click(await screen.findByRole('button', { name: /delete alpha/i }));
    await user.click(await screen.findByRole('button', { name: /^delete$/i }));

    expect(await screen.findByText(/delete failed/i)).toBeInTheDocument();
    expect(useToastStore.getState().toasts[0].tone).toBe('error');
  });

  describe('success toasts (issue #107)', () => {
    it('fires a success toast after creating a workflow', async () => {
      const user = userEvent.setup();
      mockedList.mockResolvedValueOnce([]);
      mockedCreate.mockResolvedValueOnce(makeWorkflow({ id: 'new', name: 'New' }));

      renderWorkflows();

      await user.click(await screen.findByRole('button', { name: /new workflow/i }));
      await user.type(await screen.findByLabelText(/name/i), 'New');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        const toasts = useToastStore.getState().toasts;
        expect(toasts.some((t) => t.tone === 'success' && /created/i.test(t.message))).toBe(true);
      });
    });

    it('fires an error toast when creation rejects', async () => {
      const user = userEvent.setup();
      mockedList.mockResolvedValueOnce([]);
      mockedCreate.mockRejectedValueOnce(new Error('server exploded'));

      renderWorkflows();

      await user.click(await screen.findByRole('button', { name: /new workflow/i }));
      await user.type(await screen.findByLabelText(/name/i), 'New');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        const toasts = useToastStore.getState().toasts;
        expect(toasts.some((t) => t.tone === 'error' && /server exploded/i.test(t.message))).toBe(
          true,
        );
      });
    });

    it('fires a success toast after toggling a workflow', async () => {
      const user = userEvent.setup();
      mockedList.mockResolvedValueOnce([makeWorkflow({ id: 'a', name: 'Alpha', isActive: false })]);
      mockedToggle.mockResolvedValueOnce(makeWorkflow({ id: 'a', name: 'Alpha', isActive: true }));

      renderWorkflows();

      await user.click(await screen.findByRole('switch', { name: /toggle active for alpha/i }));

      await waitFor(() => {
        const toasts = useToastStore.getState().toasts;
        expect(toasts.some((t) => t.tone === 'success')).toBe(true);
      });
    });

    it('fires a success toast after deleting a workflow', async () => {
      const user = userEvent.setup();
      mockedList.mockResolvedValueOnce([makeWorkflow({ id: 'a', name: 'Alpha' })]);
      mockedDelete.mockResolvedValueOnce();

      renderWorkflows();

      await user.click(await screen.findByRole('button', { name: /delete alpha/i }));
      await user.click(await screen.findByRole('button', { name: /^delete$/i }));

      await waitFor(() => {
        const toasts = useToastStore.getState().toasts;
        expect(toasts.some((t) => t.tone === 'success' && /deleted/i.test(t.message))).toBe(true);
      });
    });
  });
});
