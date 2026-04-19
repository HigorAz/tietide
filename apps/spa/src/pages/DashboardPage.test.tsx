import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Workflow } from '@tietide/shared';

vi.mock('@/api/workflows', () => ({
  listWorkflows: vi.fn(),
  createWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  toggleWorkflowActive: vi.fn(),
}));

import * as workflowsApi from '@/api/workflows';
import { useWorkflowsStore } from '@/stores/workflowsStore';
import { DashboardPage } from './DashboardPage';

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
  ...overrides,
});

const renderDashboard = (): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/workflows/:id" element={<div>Editor for workflow</div>} />
      </Routes>
    </MemoryRouter>,
  );

const resetStore = (): void => {
  useWorkflowsStore.setState({ workflows: [], status: 'idle', error: null });
};

describe('DashboardPage', () => {
  beforeEach(() => {
    resetStore();
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

    renderDashboard();

    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledTimes(1);
  });

  it('opens the new workflow modal when Create is clicked (AC2)', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce([]);
    renderDashboard();

    await user.click(await screen.findByRole('button', { name: /new workflow/i }));

    expect(
      await screen.findByRole('dialog', { name: /create a new workflow/i }),
    ).toBeInTheDocument();
  });

  it('removes a workflow after confirmation (AC3)', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce([makeWorkflow({ id: 'a', name: 'Alpha' })]);
    mockedDelete.mockResolvedValueOnce();

    renderDashboard();

    await user.click(await screen.findByRole('button', { name: /delete alpha/i }));
    await user.click(await screen.findByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('a'));
    await waitFor(() => expect(screen.queryByText('Alpha')).not.toBeInTheDocument());
  });

  it('renders an empty state with a CTA when there are no workflows', async () => {
    mockedList.mockResolvedValueOnce([]);

    renderDashboard();

    expect(await screen.findByText(/no workflows yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create your first workflow/i })).toBeInTheDocument();
  });

  it('calls toggleWorkflowActive when the active toggle is clicked', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce([makeWorkflow({ id: 'a', name: 'Alpha', isActive: false })]);
    mockedToggle.mockResolvedValueOnce(makeWorkflow({ id: 'a', name: 'Alpha', isActive: true }));

    renderDashboard();

    await user.click(await screen.findByRole('switch', { name: /toggle active for alpha/i }));

    await waitFor(() => expect(mockedToggle).toHaveBeenCalledWith('a', true));
  });

  it('navigates to /workflows/:id when a card is opened', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce([makeWorkflow({ id: 'a', name: 'Alpha' })]);

    renderDashboard();

    await user.click(await screen.findByRole('button', { name: /open alpha/i }));

    expect(await screen.findByText(/editor for workflow/i)).toBeInTheDocument();
  });

  it('shows an error banner with a retry button when the list request fails', async () => {
    mockedList.mockRejectedValueOnce(new Error('network down'));

    renderDashboard();

    expect(await screen.findByText(/network down/i)).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: /retry/i });
    mockedList.mockResolvedValueOnce([makeWorkflow({ id: 'a', name: 'Alpha' })]);
    await userEvent.setup().click(retry);
    expect(await screen.findByText('Alpha')).toBeInTheDocument();
  });
});
