import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { NodeFailure } from '@/api/usage';
import { NodeFailuresTable } from './NodeFailuresTable';

const rows: NodeFailure[] = [
  { nodeType: 'http-request', failures: 5, avgDurationMs: 1500 },
  { nodeType: 'slack-post-message', failures: 2, avgDurationMs: 800 },
];

describe('NodeFailuresTable', () => {
  it('renders a row per node type with failures and a formatted avg duration', () => {
    render(<NodeFailuresTable rows={rows} />);

    const httpRow = screen.getByText('http-request').closest('tr');
    expect(httpRow).not.toBeNull();
    expect(within(httpRow as HTMLElement).getByText('5')).toBeInTheDocument();
    expect(within(httpRow as HTMLElement).getByText('1.5 s')).toBeInTheDocument();
  });

  it('shows an empty state when there are no node failures', () => {
    render(<NodeFailuresTable rows={[]} />);

    expect(screen.getByText(/no node failures in this window/i)).toBeInTheDocument();
  });
});
