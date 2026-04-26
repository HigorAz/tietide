import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Workflow, WorkflowExecution } from '@tietide/shared';

vi.mock('@/api/executions', () => ({
  listExecutions: vi.fn(),
  getExecution: vi.fn(),
  listExecutionSteps: vi.fn(),
}));

vi.mock('@/api/workflows', () => ({
  getWorkflow: vi.fn(),
}));

import * as executionsApi from '@/api/executions';
import * as workflowsApi from '@/api/workflows';
import { useExecutionsStore } from '@/stores/executionsStore';
import { ExecutionHistoryPage } from './ExecutionHistoryPage';

const mockedList = vi.mocked(executionsApi.listExecutions);
const mockedGetWorkflow = vi.mocked(workflowsApi.getWorkflow);

const makeExecution = (overrides: Partial<WorkflowExecution> = {}): WorkflowExecution => ({
  id: 'exec-1',
  workflowId: 'wf-1',
  status: 'SUCCESS',
  triggerType: 'manual',
  triggerData: null,
  startedAt: new Date('2026-04-20T10:00:00Z'),
  finishedAt: new Date('2026-04-20T10:00:05Z'),
  error: null,
  createdAt: new Date('2026-04-20T10:00:00Z'),
  ...overrides,
});

const makeWorkflow = (overrides: Partial<Workflow> = {}): Workflow => ({
  id: 'wf-1',
  name: 'Daily Report',
  description: null,
  definition: { nodes: [], edges: [] },
  isActive: true,
  version: 1,
  userId: 'user-1',
  createdAt: new Date('2026-04-01T00:00:00Z'),
  updatedAt: new Date('2026-04-10T00:00:00Z'),
  executionCount: 5,
  ...overrides,
});

const renderPage = (workflowId = 'wf-1'): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={[`/workflows/${workflowId}/executions`]}>
      <Routes>
        <Route path="/workflows/:id/executions" element={<ExecutionHistoryPage />} />
        <Route path="/executions/:id" element={<div>Execution detail page</div>} />
        <Route path="/dashboard" element={<div>Dashboard page</div>} />
      </Routes>
    </MemoryRouter>,
  );

const resetStore = (): void => {
  useExecutionsStore.setState({
    list: [],
    listTotal: 0,
    listStatus: 'idle',
    listError: null,
    filters: {},
    detail: null,
    detailStatus: 'idle',
    detailError: null,
    steps: [],
    stepsStatus: 'idle',
    stepsError: null,
  });
};

describe('ExecutionHistoryPage', () => {
  beforeEach(() => {
    resetStore();
    mockedList.mockReset();
    mockedGetWorkflow.mockReset();
    mockedGetWorkflow.mockResolvedValue(makeWorkflow());
  });

  it('shows execution list with status badges (AC1)', async () => {
    mockedList.mockResolvedValueOnce({
      items: [
        makeExecution({ id: 'a', status: 'SUCCESS', triggerType: 'manual' }),
        makeExecution({ id: 'b', status: 'FAILED', triggerType: 'webhook' }),
      ],
      total: 2,
      page: 1,
      pageSize: 20,
    });

    renderPage();

    const rowA = await screen.findByTestId('execution-row-a');
    expect(within(rowA).getByText('Success')).toBeInTheDocument();
    expect(within(rowA).getByText(/manual/i)).toBeInTheDocument();

    const rowB = screen.getByTestId('execution-row-b');
    expect(within(rowB).getByText('Failed')).toBeInTheDocument();
    expect(within(rowB).getByText(/webhook/i)).toBeInTheDocument();
  });

  it('navigates to detail view when an execution row is clicked (AC2)', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce({
      items: [makeExecution({ id: 'a' })],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    renderPage();

    await user.click(await screen.findByRole('button', { name: /open execution a/i }));

    expect(await screen.findByText(/execution detail page/i)).toBeInTheDocument();
  });

  it('filters by status when the status filter changes', async () => {
    const user = userEvent.setup();
    mockedList
      .mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 20 })
      .mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 20 });

    renderPage();

    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(1));

    await user.selectOptions(await screen.findByLabelText(/status/i), 'FAILED');

    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
    expect(mockedList).toHaveBeenLastCalledWith(
      'wf-1',
      expect.objectContaining({ status: 'FAILED' }),
    );
  });

  it('filters by date range when from/to are set', async () => {
    const user = userEvent.setup();
    mockedList
      .mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 20 })
      .mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 20 });

    renderPage();

    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(1));

    await user.type(await screen.findByLabelText(/from/i), '2026-04-01');

    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
    const lastCall = mockedList.mock.calls.at(-1);
    expect(lastCall?.[1]?.from).toBeInstanceOf(Date);
  });

  it('shows the empty state when there are no executions', async () => {
    mockedList.mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 20 });

    renderPage();

    expect(await screen.findByText(/no executions yet/i)).toBeInTheDocument();
  });

  it('shows an error banner when the list request fails', async () => {
    mockedList.mockRejectedValueOnce(new Error('boom'));

    renderPage();

    expect(await screen.findByText(/boom/i)).toBeInTheDocument();
  });
});
