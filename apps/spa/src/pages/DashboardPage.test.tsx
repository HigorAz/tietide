import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { cloneElement, type ReactElement } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type * as Recharts from 'recharts';

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof Recharts>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(children, { width: 600, height: 240 } as Partial<typeof children.props>),
  };
});

vi.mock('@/api/usage', () => ({
  getUsageSummary: vi.fn(),
}));

import * as usageApi from '@/api/usage';
import type { UsageSummary } from '@/api/usage';
import { initialUsageState, useUsageStore } from '@/stores/usageStore';
import { DashboardPage } from './DashboardPage';

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
      ResizeObserverStub;
  }
});

const mockedFetch = vi.mocked(usageApi.getUsageSummary);

const sampleSummary: UsageSummary = {
  totalRuns: 142,
  successRate: 0.93,
  avgDurationMs: 4200,
  activeWorkflows: 7,
  runsPerDay: [
    { date: '2026-04-28', count: 3, failed: 0 },
    { date: '2026-04-29', count: 5, failed: 1 },
    { date: '2026-04-30', count: 0, failed: 0 },
    { date: '2026-05-01', count: 8, failed: 2 },
    { date: '2026-05-02', count: 4, failed: 0 },
    { date: '2026-05-03', count: 6, failed: 1 },
    { date: '2026-05-04', count: 12, failed: 3 },
  ],
  topWorkflows: [
    { id: 'wf-a', name: 'Alpha', runs: 42, successRate: 0.95 },
    { id: 'wf-b', name: 'Beta', runs: 30, successRate: 0.5 },
  ],
  statusBreakdown: [
    { status: 'SUCCESS', count: 132 },
    { status: 'FAILED', count: 7 },
    { status: 'RUNNING', count: 1 },
    { status: 'PENDING', count: 2 },
    { status: 'CANCELLED', count: 0 },
    { status: 'SKIPPED', count: 0 },
  ],
  triggerDistribution: [
    { triggerType: 'cron', count: 80 },
    { triggerType: 'webhook', count: 62 },
  ],
  busiestHours: Array.from({ length: 24 }, (_, hour) => ({ hour, count: hour })),
  recentFailures: [
    {
      id: 'ex-1',
      workflowId: 'wf-a',
      workflowName: 'Alpha',
      error: 'connection refused',
      finishedAt: '2026-05-04T10:00:05.000Z',
      createdAt: '2026-05-04T10:00:00.000Z',
    },
  ],
  connectionHealth: [
    { status: 'ACTIVE', count: 3 },
    { status: 'EXPIRED', count: 0 },
    { status: 'ERROR', count: 1 },
    { status: 'REVOKED', count: 0 },
  ],
  nodeFailures: [{ nodeType: 'http-request', failures: 5, avgDurationMs: 1500 }],
  comparison: { totalRunsDelta: 0.25, successRateDelta: 0.02, avgDurationDelta: -0.1 },
};

const emptySummary: UsageSummary = {
  totalRuns: 0,
  successRate: 0,
  avgDurationMs: 0,
  activeWorkflows: 0,
  runsPerDay: sampleSummary.runsPerDay.map((p) => ({ ...p, count: 0, failed: 0 })),
  topWorkflows: [],
  statusBreakdown: sampleSummary.statusBreakdown.map((s) => ({ ...s, count: 0 })),
  triggerDistribution: [],
  busiestHours: sampleSummary.busiestHours.map((h) => ({ ...h, count: 0 })),
  recentFailures: [],
  connectionHealth: sampleSummary.connectionHealth.map((c) => ({ ...c, count: 0 })),
  nodeFailures: [],
  comparison: { totalRunsDelta: null, successRateDelta: 0, avgDurationDelta: null },
};

const resetStore = (): void => {
  useUsageStore.setState({ ...initialUsageState });
};

function LocationStatePeek(): JSX.Element {
  const location = useLocation();
  const from = (location.state as { from?: unknown } | null)?.from;
  return <div data-testid="peek-from">{typeof from === 'string' ? from : ''}</div>;
}

const renderDashboard = (): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/workflows/:id" element={<LocationStatePeek />} />
      </Routes>
    </MemoryRouter>,
  );

describe('DashboardPage', () => {
  beforeEach(() => {
    resetStore();
    mockedFetch.mockReset();
  });

  it('fetches usage on mount with the default range of 7d', async () => {
    mockedFetch.mockResolvedValueOnce(sampleSummary);

    renderDashboard();

    await waitFor(() => expect(mockedFetch).toHaveBeenCalledWith('7d'));
  });

  it('renders four stat cards with formatted values from the API', async () => {
    mockedFetch.mockResolvedValueOnce(sampleSummary);

    renderDashboard();

    // Wait for the data to land, then scope assertions to the metrics section
    // to avoid colliding with the "Success rate" column header in the table.
    await screen.findByText('142');
    const metrics = screen.getByRole('region', { name: /summary metrics/i });

    expect(within(metrics).getByText('Total runs')).toBeInTheDocument();
    expect(within(metrics).getByText('142')).toBeInTheDocument();

    expect(within(metrics).getByText('Success rate')).toBeInTheDocument();
    expect(within(metrics).getByText('93%')).toBeInTheDocument();

    expect(within(metrics).getByText('Avg duration')).toBeInTheDocument();
    expect(within(metrics).getByText('4.2s')).toBeInTheDocument();

    expect(within(metrics).getByText('Active workflows')).toBeInTheDocument();
    expect(within(metrics).getByText('7')).toBeInTheDocument();
  });

  it('renders the recharts runs-per-day chart', async () => {
    mockedFetch.mockResolvedValueOnce(sampleSummary);

    const { container } = renderDashboard();

    expect(await screen.findByTestId('runs-per-day-chart')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('.recharts-line')).toBeTruthy());
  });

  it('navigates to /workflows/:id with state.from = "/dashboard" when a top-workflow row is clicked', async () => {
    const user = userEvent.setup();
    mockedFetch.mockResolvedValueOnce(sampleSummary);

    renderDashboard();

    const rows = await screen.findAllByRole('button', { name: /open alpha/i });
    await user.click(rows[0]);

    expect(await screen.findByTestId('peek-from')).toHaveTextContent('/dashboard');
  });

  it('refetches when the range tab changes from 7d to 30d', async () => {
    const user = userEvent.setup();
    mockedFetch
      .mockResolvedValueOnce(sampleSummary)
      .mockResolvedValueOnce({ ...sampleSummary, totalRuns: 999 });

    renderDashboard();
    await screen.findByText('142');

    await user.click(screen.getByRole('tab', { name: '30d' }));

    await waitFor(() => expect(mockedFetch).toHaveBeenCalledWith('30d'));
    await screen.findByText('999');
  });

  it('shows an error banner with a retry button when the fetch rejects', async () => {
    const user = userEvent.setup();
    mockedFetch.mockRejectedValueOnce(new Error('boom'));

    renderDashboard();

    expect(await screen.findByRole('alert')).toHaveTextContent(/boom/i);

    mockedFetch.mockResolvedValueOnce(sampleSummary);
    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(await screen.findByText('142')).toBeInTheDocument();
  });

  it('displays an empty top-workflows state when there are no runs', async () => {
    mockedFetch.mockResolvedValueOnce({
      ...sampleSummary,
      totalRuns: 0,
      topWorkflows: [],
      runsPerDay: sampleSummary.runsPerDay.map((p) => ({ ...p, count: 0 })),
    });

    renderDashboard();

    expect(await screen.findByText(/no workflow runs in this window/i)).toBeInTheDocument();
  });

  it('renders the status donut, trigger donut, error-rate and busiest-hours charts', async () => {
    mockedFetch.mockResolvedValueOnce(sampleSummary);

    renderDashboard();

    expect(await screen.findByTestId('status-donut')).toBeInTheDocument();
    expect(screen.getByTestId('trigger-donut')).toBeInTheDocument();
    expect(screen.getByTestId('error-rate-chart')).toBeInTheDocument();
    expect(screen.getByTestId('busiest-hours-chart')).toBeInTheDocument();
  });

  it('renders recent failures linking to the execution detail and connection health', async () => {
    mockedFetch.mockResolvedValueOnce(sampleSummary);

    renderDashboard();

    const failureLink = await screen.findByRole('link', { name: /alpha/i });
    expect(failureLink).toHaveAttribute('href', '/executions/ex-1');
    expect(screen.getByRole('link', { name: /view connections/i })).toHaveAttribute(
      'href',
      '/connections',
    );
  });

  it('renders the top failing nodes table', async () => {
    mockedFetch.mockResolvedValueOnce(sampleSummary);

    renderDashboard();

    expect(await screen.findByText('http-request')).toBeInTheDocument();
  });

  it('shows a previous-period delta on the headline stat cards', async () => {
    mockedFetch.mockResolvedValueOnce(sampleSummary);

    renderDashboard();

    const metrics = await screen.findByRole('region', { name: /summary metrics/i });
    const deltas = within(metrics).getAllByTestId('stat-delta');
    // Total runs (+25%), success rate (+2%), avg duration (-10%) — active workflows has none.
    expect(deltas).toHaveLength(3);
    expect(deltas[0]).toHaveTextContent('25%');
  });

  it('handles empty states across the new sections when there is no data', async () => {
    mockedFetch.mockResolvedValueOnce(emptySummary);

    renderDashboard();

    expect(await screen.findByText(/no failures in this window/i)).toBeInTheDocument();
    expect(screen.getByText(/no node failures in this window/i)).toBeInTheDocument();
    expect(screen.getByText(/no connections configured/i)).toBeInTheDocument();
    // donuts collapse to their empty message (one per donut)
    expect(screen.getAllByText(/no executions in this window/i).length).toBeGreaterThanOrEqual(2);
    // prior window empty → no-prior-data on the comparable stat cards
    expect(screen.getAllByText(/no prior data/i).length).toBeGreaterThanOrEqual(1);
  });
});
