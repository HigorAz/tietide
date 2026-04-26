import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('renders the status label in title case', () => {
    render(<StatusBadge status="SUCCESS" />);
    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  it('marks failed status with the error data attribute', () => {
    render(<StatusBadge status="FAILED" />);
    const badge = screen.getByText('Failed');
    expect(badge).toHaveAttribute('data-tone', 'error');
  });

  it('marks running status with the running data attribute', () => {
    render(<StatusBadge status="RUNNING" />);
    const badge = screen.getByText('Running');
    expect(badge).toHaveAttribute('data-tone', 'running');
  });

  it('falls back to a neutral tone for unknown status', () => {
    render(<StatusBadge status="WEIRD" />);
    const badge = screen.getByText('Weird');
    expect(badge).toHaveAttribute('data-tone', 'neutral');
  });
});
