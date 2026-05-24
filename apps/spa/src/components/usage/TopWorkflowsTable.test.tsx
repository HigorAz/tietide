import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

  it('renders one table row per workflow with name, runs, and success rate (desktop)', () => {
    render(<TopWorkflowsTable rows={sampleRows} onRowClick={onRowClick} />);
    const table = screen.getByRole('table');

    expect(within(table).getByText('Alpha')).toBeInTheDocument();
    expect(within(table).getByText('42')).toBeInTheDocument();
    expect(within(table).getByText('95%')).toBeInTheDocument();
    expect(within(table).getByText('Beta')).toBeInTheDocument();
    expect(within(table).getByText('30')).toBeInTheDocument();
    expect(within(table).getByText('50%')).toBeInTheDocument();
  });

  it('also renders a stacked card per workflow for mobile viewports', () => {
    render(<TopWorkflowsTable rows={sampleRows} onRowClick={onRowClick} />);
    // Both the table and the mobile card list carry an "Open X" button.
    expect(screen.getAllByRole('button', { name: /open alpha/i })).toHaveLength(2);
    expect(screen.getByText(/42 runs/i)).toBeInTheDocument();
    expect(screen.getByText(/95% success/i)).toBeInTheDocument();
  });

  it('renders an empty-state message when there are no rows', () => {
    render(<TopWorkflowsTable rows={[]} onRowClick={onRowClick} />);

    expect(screen.getByText(/no workflow runs/i)).toBeInTheDocument();
  });

  it('calls onRowClick with the workflow id when a row is clicked', async () => {
    const user = userEvent.setup();
    render(<TopWorkflowsTable rows={sampleRows} onRowClick={onRowClick} />);
    const table = screen.getByRole('table');

    await user.click(within(table).getByRole('button', { name: /open alpha/i }));

    expect(onRowClick).toHaveBeenCalledWith('wf-a');
  });

  it('calls onRowClick when Enter is pressed on a focused row', async () => {
    const user = userEvent.setup();
    render(<TopWorkflowsTable rows={sampleRows} onRowClick={onRowClick} />);
    const table = screen.getByRole('table');

    const row = within(table).getByRole('button', { name: /open beta/i });
    row.focus();
    await user.keyboard('{Enter}');

    expect(onRowClick).toHaveBeenCalledWith('wf-b');
  });

  it('calls onRowClick when a mobile card is activated', async () => {
    const user = userEvent.setup();
    render(<TopWorkflowsTable rows={sampleRows} onRowClick={onRowClick} />);
    const cardList = screen.getByRole('list');

    await user.click(within(cardList).getByRole('button', { name: /open alpha/i }));

    expect(onRowClick).toHaveBeenCalledWith('wf-a');
  });
});
