import { describe, it, expect, beforeAll, vi } from 'vitest';
import { cloneElement, type ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import type * as Recharts from 'recharts';
import type { RunsPerDayPoint } from '@/api/usage';

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

import { ErrorRateChart } from './ErrorRateChart';

const data: RunsPerDayPoint[] = [
  { date: '2026-05-03', count: 10, failed: 1 },
  { date: '2026-05-04', count: 4, failed: 2 },
];

describe('ErrorRateChart', () => {
  it('renders the heading and the chart container', () => {
    render(<ErrorRateChart data={data} />);

    expect(screen.getByRole('heading', { name: /error rate per day/i })).toBeInTheDocument();
    expect(screen.getByTestId('error-rate-chart')).toBeInTheDocument();
  });

  it('renders an SVG line for the rate', () => {
    const { container } = render(<ErrorRateChart data={data} />);

    expect(container.querySelector('.recharts-line')).toBeTruthy();
  });

  it('does not crash with an empty data array', () => {
    render(<ErrorRateChart data={[]} />);

    expect(screen.getByTestId('error-rate-chart')).toBeInTheDocument();
  });
});
