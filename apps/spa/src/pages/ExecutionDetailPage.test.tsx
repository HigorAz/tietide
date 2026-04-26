import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ExecutionStep, WorkflowExecution } from '@tietide/shared';

vi.mock('@/api/executions', () => ({
  listExecutions: vi.fn(),
  getExecution: vi.fn(),
  listExecutionSteps: vi.fn(),
}));

import * as executionsApi from '@/api/executions';
import { useExecutionsStore } from '@/stores/executionsStore';
import { ExecutionDetailPage } from './ExecutionDetailPage';

const mockedGet = vi.mocked(executionsApi.getExecution);
const mockedSteps = vi.mocked(executionsApi.listExecutionSteps);

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

const makeStep = (overrides: Partial<ExecutionStep> = {}): ExecutionStep => ({
  id: 'step-1',
  executionId: 'exec-1',
  nodeId: 'trigger-1',
  nodeType: 'manual_trigger',
  nodeName: 'Start',
  status: 'SUCCESS',
  inputData: null,
  outputData: { ok: true },
  error: null,
  startedAt: new Date('2026-04-20T10:00:00Z'),
  finishedAt: new Date('2026-04-20T10:00:01Z'),
  durationMs: 1000,
  ...overrides,
});

const renderPage = (executionId = 'exec-1'): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={[`/executions/${executionId}`]}>
      <Routes>
        <Route path="/executions/:id" element={<ExecutionDetailPage />} />
        <Route path="/workflows/:id/executions" element={<div>History page</div>} />
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

describe('ExecutionDetailPage', () => {
  beforeEach(() => {
    resetStore();
    mockedGet.mockReset();
    mockedSteps.mockReset();
  });

  it('shows the per-node timeline with input/output and timing (AC3)', async () => {
    mockedGet.mockResolvedValueOnce(makeExecution());
    mockedSteps.mockResolvedValueOnce([
      makeStep({ id: 's1', nodeName: 'Start', durationMs: 250 }),
      makeStep({
        id: 's2',
        nodeId: 'http-1',
        nodeType: 'http_request',
        nodeName: 'Call API',
        durationMs: 4500,
      }),
    ]);

    renderPage();

    expect(await screen.findByText('Start')).toBeInTheDocument();
    expect(screen.getByText('Call API')).toBeInTheDocument();
    expect(screen.getByText('http_request')).toBeInTheDocument();

    const startCard = screen.getByTestId('step-card-s1');
    await userEvent.click(within(startCard).getByRole('button', { name: /show details/i }));
    expect(screen.getByText(/"ok": true/)).toBeInTheDocument();
  });

  it('highlights failed nodes with the error tone (AC4)', async () => {
    mockedGet.mockResolvedValueOnce(makeExecution({ status: 'FAILED' }));
    mockedSteps.mockResolvedValueOnce([
      makeStep({
        id: 's1',
        status: 'FAILED',
        error: 'HTTP 500 — boom',
      }),
    ]);

    renderPage();

    const card = await screen.findByTestId('step-card-s1');
    expect(card).toHaveAttribute('data-status', 'FAILED');
    expect(screen.getByText(/HTTP 500 — boom/)).toBeInTheDocument();
  });

  it('renders the execution status header', async () => {
    mockedGet.mockResolvedValueOnce(makeExecution({ status: 'RUNNING', triggerType: 'cron' }));
    mockedSteps.mockResolvedValueOnce([]);

    renderPage();

    await waitFor(() => expect(screen.getByText('Running')).toBeInTheDocument());
    expect(screen.getByText(/cron/i)).toBeInTheDocument();
  });

  it('shows an error banner when the detail request fails', async () => {
    mockedGet.mockRejectedValueOnce(new Error('execution not found'));
    mockedSteps.mockResolvedValueOnce([]);

    renderPage();

    expect(await screen.findByText(/execution not found/i)).toBeInTheDocument();
  });

  it('shows an empty state for steps when there are none', async () => {
    mockedGet.mockResolvedValueOnce(makeExecution());
    mockedSteps.mockResolvedValueOnce([]);

    renderPage();

    expect(await screen.findByText(/no steps recorded/i)).toBeInTheDocument();
  });
});
