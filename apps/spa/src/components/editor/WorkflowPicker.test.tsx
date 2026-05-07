import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Workflow } from '@tietide/shared';
import { useWorkflowsStore } from '@/stores/workflowsStore';
import { WorkflowPicker } from './WorkflowPicker';

const wf = (overrides: Partial<Workflow>): Workflow => ({
  id: 'wf-1',
  name: 'Workflow A',
  description: null,
  isActive: false,
  version: 1,
  definition: { nodes: [], edges: [] },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('WorkflowPicker', () => {
  beforeEach(() => {
    useWorkflowsStore.setState({ workflows: [], status: 'ready', error: null });
  });

  it('should render the empty state when no workflows are available', () => {
    render(<WorkflowPicker value={null} onChange={() => undefined} />);
    expect(screen.getByTestId('workflow-picker-empty')).toBeInTheDocument();
  });

  it('should render the empty state when all workflows are excluded', () => {
    useWorkflowsStore.setState({
      workflows: [wf({ id: 'wf-only', name: 'Only Workflow' })],
      status: 'ready',
      error: null,
    });
    render(<WorkflowPicker value={null} onChange={() => undefined} excludeIds={['wf-only']} />);
    expect(screen.getByTestId('workflow-picker-empty')).toBeInTheDocument();
  });

  it('should render the picker trigger when at least one non-excluded workflow exists', () => {
    useWorkflowsStore.setState({
      workflows: [wf({ id: 'wf-current', name: 'Current' }), wf({ id: 'wf-other', name: 'Other' })],
      status: 'ready',
      error: null,
    });
    render(<WorkflowPicker value={null} onChange={() => undefined} excludeIds={['wf-current']} />);
    expect(screen.getByTestId('workflow-picker-trigger')).toBeInTheDocument();
  });

  it('should call fetch on mount when status is idle', () => {
    const fetch = vi.fn(async () => undefined);
    useWorkflowsStore.setState({ workflows: [], status: 'idle', error: null, fetch });
    render(<WorkflowPicker value={null} onChange={() => undefined} />);
    expect(fetch).toHaveBeenCalled();
  });
});
