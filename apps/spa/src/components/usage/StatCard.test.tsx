import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('renders the label and value', () => {
    render(<StatCard label="Total runs" value="142" />);

    expect(screen.getByText('Total runs')).toBeInTheDocument();
    expect(screen.getByText('142')).toBeInTheDocument();
  });

  it('renders an optional hint when provided', () => {
    render(<StatCard label="Avg duration" value="4.2s" hint="last 7 days" />);

    expect(screen.getByText('last 7 days')).toBeInTheDocument();
  });

  it('does not render a hint when the prop is omitted', () => {
    render(<StatCard label="Active" value="7" />);

    expect(screen.queryByText(/last \d+ days/i)).not.toBeInTheDocument();
  });

  it('renders an upward delta as a positive percentage', () => {
    render(<StatCard label="Total runs" value="150" delta={0.5} />);

    const delta = screen.getByTestId('stat-delta');
    expect(delta).toHaveTextContent('50%');
    expect(delta.textContent).toMatch(/▲|\+/);
  });

  it('renders a downward delta as a negative percentage', () => {
    render(<StatCard label="Total runs" value="50" delta={-0.5} />);

    const delta = screen.getByTestId('stat-delta');
    expect(delta).toHaveTextContent('50%');
    expect(delta.textContent).toMatch(/▼|-/);
  });

  it('shows a no-prior-data hint when delta is null', () => {
    render(<StatCard label="Total runs" value="150" delta={null} />);

    expect(screen.getByTestId('stat-delta')).toHaveTextContent(/no prior data|—/i);
  });

  it('does not render a delta element when delta is undefined', () => {
    render(<StatCard label="Total runs" value="150" />);

    expect(screen.queryByTestId('stat-delta')).not.toBeInTheDocument();
  });

  it('treats a downward delta as the good direction when invertDelta is set', () => {
    render(<StatCard label="Avg duration" value="1s" delta={-0.2} invertDelta />);

    const delta = screen.getByTestId('stat-delta');
    expect(delta).toHaveTextContent('20%');
    expect(delta.className).toMatch(/text-success/);
  });
});
