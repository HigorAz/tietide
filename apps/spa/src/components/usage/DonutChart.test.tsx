import { describe, it, expect, beforeAll, vi } from 'vitest';
import { cloneElement, type ReactElement } from 'react';
import { render, screen, within } from '@testing-library/react';
import type * as Recharts from 'recharts';

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof Recharts>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(children, { width: 160, height: 160 } as Partial<typeof children.props>),
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

import { DonutChart, type DonutDatum } from './DonutChart';

const data: DonutDatum[] = [
  { name: 'SUCCESS', value: 8, color: '#12B886' },
  { name: 'FAILED', value: 2, color: '#FF6B6B' },
  { name: 'PENDING', value: 0, color: '#6B7C93' },
];

describe('DonutChart', () => {
  it('renders the title and a legend entry with the count for each datum', () => {
    render(<DonutChart title="Execution status" data={data} testId="status-donut" />);

    expect(screen.getByRole('heading', { name: /execution status/i })).toBeInTheDocument();
    const card = screen.getByTestId('status-donut');
    const success = within(card).getByText('SUCCESS').closest('li');
    expect(success).not.toBeNull();
    expect(within(success as HTMLElement).getByText('8')).toBeInTheDocument();
  });

  it('lists zero-value entries in the legend (stable donut)', () => {
    render(<DonutChart title="Execution status" data={data} />);

    expect(screen.getByText('PENDING')).toBeInTheDocument();
  });

  it('shows the empty message when every value is zero', () => {
    render(
      <DonutChart
        title="Execution status"
        data={[{ name: 'SUCCESS', value: 0, color: '#12B886' }]}
        emptyMessage="No runs yet."
      />,
    );

    expect(screen.getByText('No runs yet.')).toBeInTheDocument();
  });
});
