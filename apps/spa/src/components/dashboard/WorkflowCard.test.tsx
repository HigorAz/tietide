import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Workflow } from '@tietide/shared';
import { WorkflowCard } from './WorkflowCard';

const makeWorkflow = (overrides: Partial<Workflow> = {}): Workflow => ({
  id: 'wf-1',
  name: 'My Workflow',
  description: null,
  definition: { nodes: [], edges: [] },
  isActive: false,
  version: 1,
  userId: 'user-1',
  createdAt: new Date('2026-04-01T12:00:00Z'),
  updatedAt: new Date('2026-04-10T12:00:00Z'),
  executionCount: 0,
  ...overrides,
});

describe('WorkflowCard', () => {
  const onOpen = vi.fn();
  const onToggle = vi.fn();
  const onDelete = vi.fn();

  beforeEach(() => {
    onOpen.mockReset();
    onToggle.mockReset();
    onDelete.mockReset();
  });

  const renderCard = (overrides: Partial<Workflow> = {}) =>
    render(
      <WorkflowCard
        workflow={makeWorkflow(overrides)}
        onOpen={onOpen}
        onToggle={onToggle}
        onDelete={onDelete}
      />,
    );

  it('should render the workflow name and an inactive status pill by default', () => {
    renderCard();

    expect(screen.getByText('My Workflow')).toBeInTheDocument();
    expect(screen.getByText(/inactive/i)).toBeInTheDocument();
  });

  it('should render an active status pill when the workflow is active', () => {
    renderCard({ isActive: true });

    expect(screen.getByText(/active/i)).toBeInTheDocument();
    expect(screen.queryByText(/inactive/i)).not.toBeInTheDocument();
  });

  it('should render the execution count from the workflow', () => {
    renderCard({ executionCount: 7 });

    expect(screen.getByTestId('workflow-card-executions')).toHaveTextContent('7');
  });

  it('should render 0 when the workflow has no executions yet', () => {
    renderCard({ executionCount: 0 });

    expect(screen.getByTestId('workflow-card-executions')).toHaveTextContent('0');
  });

  it('should call onOpen with the workflow id when the card is clicked', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole('button', { name: /open my workflow/i }));

    expect(onOpen).toHaveBeenCalledWith('wf-1');
  });

  it('should call onToggle with the flipped value and not trigger onOpen', async () => {
    const user = userEvent.setup();
    renderCard({ isActive: false });

    await user.click(screen.getByRole('switch', { name: /toggle active/i }));

    expect(onToggle).toHaveBeenCalledWith('wf-1', true);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('should call onDelete with the workflow id and not trigger onOpen', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole('button', { name: /delete my workflow/i }));

    expect(onDelete).toHaveBeenCalledWith('wf-1');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('should render last modified information based on updatedAt', () => {
    renderCard({ updatedAt: new Date('2026-04-10T12:00:00Z') });

    expect(screen.getByTestId('workflow-card-updated')).toBeInTheDocument();
  });
});
