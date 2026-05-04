import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TopWorkflowsTable } from './TopWorkflowsTable';

const sampleRows = [
  { id: 'wf-a', name: 'Alpha', runs: 42, successRate: 0.95 },
  { id: 'wf-b', name: 'Beta', runs: 30, successRate: 0.5 },
];

describe('TopWorkflowsTable', () => {
  const onRowClick = vi.fn();

  beforeEach(() => {
    onRowClick.mockReset();
  });

  it('renders one row per workflow with name, runs, and success rate', () => {
    render(<TopWorkflowsTable rows={sampleRows} onRowClick={onRowClick} />);

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('95%')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('renders an empty-state message when there are no rows', () => {
    render(<TopWorkflowsTable rows={[]} onRowClick={onRowClick} />);

    expect(screen.getByText(/no workflow runs/i)).toBeInTheDocument();
  });

  it('calls onRowClick with the workflow id when a row is clicked', async () => {
    const user = userEvent.setup();
    render(<TopWorkflowsTable rows={sampleRows} onRowClick={onRowClick} />);

    await user.click(screen.getByRole('button', { name: /open alpha/i }));

    expect(onRowClick).toHaveBeenCalledWith('wf-a');
  });

  it('calls onRowClick when Enter is pressed on a focused row', async () => {
    const user = userEvent.setup();
    render(<TopWorkflowsTable rows={sampleRows} onRowClick={onRowClick} />);

    const row = screen.getByRole('button', { name: /open beta/i });
    row.focus();
    await user.keyboard('{Enter}');

    expect(onRowClick).toHaveBeenCalledWith('wf-b');
  });
});
