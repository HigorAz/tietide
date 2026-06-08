import { describe, it, expect, beforeAll, vi } from 'vitest';
import { cloneElement, type ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import type * as Recharts from 'recharts';
import type { BusiestHour } from '@/api/usage';

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

import { BusiestHoursChart } from './BusiestHoursChart';

const data: BusiestHour[] = Array.from({ length: 24 }, (_, hour) => ({ hour, count: hour }));

describe('BusiestHoursChart', () => {
  it('renders the heading and the chart container', () => {
    render(<BusiestHoursChart data={data} />);

    expect(screen.getByRole('heading', { name: /busiest hours/i })).toBeInTheDocument();
    expect(screen.getByTestId('busiest-hours-chart')).toBeInTheDocument();
  });

  it('renders SVG bars for the hour buckets', () => {
    const { container } = render(<BusiestHoursChart data={data} />);

    expect(container.querySelector('.recharts-bar')).toBeTruthy();
  });

  it('does not crash with all-zero buckets', () => {
    render(<BusiestHoursChart data={data.map((d) => ({ ...d, count: 0 }))} />);

    expect(screen.getByTestId('busiest-hours-chart')).toBeInTheDocument();
  });
});
