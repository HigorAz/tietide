import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Workflow, WorkflowExecution } from '@tietide/shared';

vi.mock('@/api/executions', () => ({
  listExecutions: vi.fn(),
  listAllExecutions: vi.fn(),
  getExecution: vi.fn(),
  listExecutionSteps: vi.fn(),
}));

vi.mock('@/api/workflows', () => ({
  listWorkflows: vi.fn(),
}));

import * as executionsApi from '@/api/executions';
import * as workflowsApi from '@/api/workflows';
import { useExecutionsStore } from '@/stores/executionsStore';
import { useWorkflowsStore } from '@/stores/workflowsStore';
import { GlobalHistoryPage } from './GlobalHistoryPage';

const mockedListAll = vi.mocked(executionsApi.listAllExecutions);
const mockedListWorkflows = vi.mocked(workflowsApi.listWorkflows);

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
  documentation: null,
  ...overrides,
});

function LocationProbe(): JSX.Element {
  const location = useLocation();
  return (
    <div data-testid="location-probe">
      {location.pathname}
      {location.search}
    </div>
  );
}

const renderPage = (): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={['/history']}>
      <Routes>
        <Route path="/history" element={<GlobalHistoryPage />} />
        <Route path="/workflows/:id" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );

const resetStores = (): void => {
  useExecutionsStore.setState({
    list: [],
    listTotal: 0,
    listStatus: 'idle',
    listError: null,
    listNextCursor: null,
    filters: {},
  });
  useWorkflowsStore.setState({ workflows: [], status: 'idle', error: null });
};

describe('GlobalHistoryPage', () => {
  beforeEach(() => {
    resetStores();
    mockedListAll.mockReset();
    mockedListWorkflows.mockReset();
    mockedListWorkflows.mockResolvedValue([
      makeWorkflow({ id: 'wf-1', name: 'Daily Report' }),
      makeWorkflow({ id: 'wf-2', name: 'Slack Bridge' }),
    ]);
  });

  it('renders execution rows from the API with workflow names joined client-side (AC1)', async () => {
    mockedListAll.mockResolvedValueOnce({
      items: [
        makeExecution({ id: 'e1', workflowId: 'wf-1', status: 'SUCCESS' }),
        makeExecution({ id: 'e2', workflowId: 'wf-2', status: 'FAILED' }),
      ],
      total: 2,
      page: 1,
      pageSize: 20,
      nextCursor: null,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('execution-row-e1')).toBeInTheDocument();
    });

    const row1 = screen.getByTestId('execution-row-e1');
    expect(within(row1).getByText('Daily Report')).toBeInTheDocument();
    expect(within(row1).getByText(/Success/i)).toBeInTheDocument();

    const row2 = screen.getByTestId('execution-row-e2');
    expect(within(row2).getByText('Slack Bridge')).toBeInTheDocument();
    expect(within(row2).getByText(/Failed/i)).toBeInTheDocument();
  });

  it('narrows results when the workflow filter is changed (AC2)', async () => {
    mockedListAll.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      nextCursor: null,
    });
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(mockedListAll).toHaveBeenCalled();
    });

    const select = screen.getByLabelText(/workflow/i);
    await user.selectOptions(select, 'wf-2');

    await waitFor(() => {
      expect(mockedListAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ workflowId: 'wf-2' }),
      );
    });
  });

  it('narrows results when the status filter is changed (AC3)', async () => {
    mockedListAll.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      nextCursor: null,
    });
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(mockedListAll).toHaveBeenCalled();
    });

    const select = screen.getByLabelText(/status/i);
    await user.selectOptions(select, 'FAILED');

    await waitFor(() => {
      expect(mockedListAll).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'FAILED' }));
    });
  });

  it('navigates to the editor in replay mode when a row is clicked (AC4)', async () => {
    mockedListAll.mockResolvedValueOnce({
      items: [makeExecution({ id: 'e1', workflowId: 'wf-1' })],
      total: 1,
      page: 1,
      pageSize: 20,
      nextCursor: null,
    });
    const user = userEvent.setup();

    renderPage();

    const row = await screen.findByTestId('execution-row-e1');
    await user.click(row);

    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent(
        '/workflows/wf-1?execution=e1',
      );
    });
  });

  it('loads the next cursor page when "Load more" is clicked (AC5)', async () => {
    mockedListAll
      .mockResolvedValueOnce({
        items: [makeExecution({ id: 'e1', workflowId: 'wf-1' })],
        total: 50,
        page: 1,
        pageSize: 20,
        nextCursor: 'CURSOR_PAGE_2',
      })
      .mockResolvedValueOnce({
        items: [makeExecution({ id: 'e2', workflowId: 'wf-1' })],
        total: 50,
        page: 1,
        pageSize: 20,
        nextCursor: null,
      });
    const user = userEvent.setup();

    renderPage();

    await screen.findByTestId('execution-row-e1');

    const loadMore = screen.getByRole('button', { name: /load more/i });
    await user.click(loadMore);

    await waitFor(() => {
      expect(mockedListAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: 'CURSOR_PAGE_2' }),
      );
    });

    expect(await screen.findByTestId('execution-row-e2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });

  it('shows an empty state when the user has no executions', async () => {
    mockedListAll.mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      nextCursor: null,
    });

    renderPage();

    expect(await screen.findByText(/no executions yet/i)).toBeInTheDocument();
  });
});
