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
});
