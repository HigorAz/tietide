import { describe, it, expect, beforeAll, vi } from 'vitest';
import { cloneElement, type ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import type * as Recharts from 'recharts';

// recharts ResizeObserver dependency: jsdom does not provide it, and even with
// a stub the ResponsiveContainer cannot measure its parent (jsdom has no layout
// engine). Replace ResponsiveContainer with a pass-through that hands a fixed
// width/height to the inner chart so the SVG actually paints under test.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof Recharts>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(children, { width: 600, height: 240 } as Partial<typeof children.props>),
  };
});

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

import { RunsPerDayChart } from './RunsPerDayChart';

const sampleData = [
  { date: '2026-04-28', count: 3 },
  { date: '2026-04-29', count: 5 },
  { date: '2026-04-30', count: 0 },
  { date: '2026-05-01', count: 8 },
  { date: '2026-05-02', count: 4 },
  { date: '2026-05-03', count: 6 },
  { date: '2026-05-04', count: 12 },
];

describe('RunsPerDayChart', () => {
  it('renders the chart container with the test id', () => {
    render(<RunsPerDayChart data={sampleData} />);

    expect(screen.getByTestId('runs-per-day-chart')).toBeInTheDocument();
  });

  it('renders the section heading', () => {
    render(<RunsPerDayChart data={sampleData} />);

    expect(screen.getByRole('heading', { name: /runs per day/i })).toBeInTheDocument();
  });

  it('renders an SVG line for the run counts', () => {
    const { container } = render(<RunsPerDayChart data={sampleData} />);

    expect(container.querySelector('.recharts-line')).toBeTruthy();
  });

  it('does not crash when given an empty data array', () => {
    render(<RunsPerDayChart data={[]} />);

    expect(screen.getByTestId('runs-per-day-chart')).toBeInTheDocument();
  });
});
