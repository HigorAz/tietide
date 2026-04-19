import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Workflow } from '@tietide/shared';
import { DeleteWorkflowDialog } from './DeleteWorkflowDialog';

const makeWorkflow = (overrides: Partial<Workflow> = {}): Workflow => ({
  id: 'wf-42',
  name: 'Doomed Workflow',
  description: null,
  definition: { nodes: [], edges: [] },
  isActive: false,
  version: 1,
  userId: 'user-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

describe('DeleteWorkflowDialog', () => {
  const onClose = vi.fn();
  const onConfirm = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    onClose.mockReset();
    onConfirm.mockReset();
    onConfirm.mockResolvedValue(undefined);
  });

  it('should render the workflow name in the confirmation message', () => {
    render(
      <DeleteWorkflowDialog workflow={makeWorkflow()} onClose={onClose} onConfirm={onConfirm} />,
    );

    expect(screen.getByRole('dialog', { name: /delete workflow/i })).toBeInTheDocument();
    expect(screen.getByText(/doomed workflow/i)).toBeInTheDocument();
  });

  it('should call onClose (and not onConfirm) when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(
      <DeleteWorkflowDialog workflow={makeWorkflow()} onClose={onClose} onConfirm={onConfirm} />,
    );

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('should call onConfirm with the workflow id when Delete is clicked', async () => {
    const user = userEvent.setup();
    render(
      <DeleteWorkflowDialog workflow={makeWorkflow()} onClose={onClose} onConfirm={onConfirm} />,
    );

    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(onConfirm).toHaveBeenCalledWith('wf-42');
  });
});
