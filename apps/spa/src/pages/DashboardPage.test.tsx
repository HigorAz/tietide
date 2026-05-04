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
    { date: '2026-04-28', count: 3 },
    { date: '2026-04-29', count: 5 },
    { date: '2026-04-30', count: 0 },
    { date: '2026-05-01', count: 8 },
    { date: '2026-05-02', count: 4 },
    { date: '2026-05-03', count: 6 },
    { date: '2026-05-04', count: 12 },
  ],
  topWorkflows: [
    { id: 'wf-a', name: 'Alpha', runs: 42, successRate: 0.95 },
    { id: 'wf-b', name: 'Beta', runs: 30, successRate: 0.5 },
  ],
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

    await user.click(await screen.findByRole('button', { name: /open alpha/i }));

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
});
