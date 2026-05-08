import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { useWorkflowsStore } from '@/stores/workflowsStore';
import type { Workflow } from '@tietide/shared';
import { SubworkflowForm } from './SubworkflowForm';

const NODE_ID = 'subwf-node-1';

const wf = (overrides: Partial<Workflow> = {}): Workflow => ({
  id: 'wf-1',
  name: 'Workflow A',
  description: null,
  isActive: false,
  version: 1,
  userId: 'user-test',
  definition: { nodes: [], edges: [] },
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  executionCount: 0,
  documentation: null,
  folderId: null,
  tags: [],
  ...overrides,
});

describe('SubworkflowForm', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState, workflowId: 'wf-current' });
    useWorkflowsStore.setState({
      workflows: [],
      status: 'ready',
      error: null,
    });
  });

  it('should render the WorkflowPicker (excluding the current workflow)', () => {
    useWorkflowsStore.setState({
      workflows: [wf({ id: 'wf-current', name: 'Current' }), wf({ id: 'wf-other', name: 'Other' })],
      status: 'ready',
      error: null,
    });
    render(<SubworkflowForm nodeId={NODE_ID} config={{}} />);
    // The picker hides the current workflow, so we expect a Select trigger
    // (rather than the empty state) — i.e. the "no workflows" empty card is NOT rendered.
    expect(screen.queryByTestId('workflow-picker-empty')).toBeNull();
  });

  it('should show the empty state when only the current workflow exists', () => {
    useWorkflowsStore.setState({
      workflows: [wf({ id: 'wf-current', name: 'Current' })],
      status: 'ready',
      error: null,
    });
    render(<SubworkflowForm nodeId={NODE_ID} config={{}} />);
    expect(screen.getByTestId('workflow-picker-empty')).toBeInTheDocument();
  });

  it('should commit a valid input mapping JSON to the store', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    render(<SubworkflowForm nodeId={NODE_ID} config={{}} />);
    const textarea = screen.getByLabelText(/input mapping/i);
    fireEvent.change(textarea, { target: { value: '{"item": "{{iter1.item}}"}' } });

    expect(updateNodeConfig).toHaveBeenCalledWith(NODE_ID, {
      inputMapping: { item: '{{iter1.item}}' },
    });
  });

  it('should surface a JSON parse error and not commit when the textarea is malformed', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    render(<SubworkflowForm nodeId={NODE_ID} config={{}} />);
    const textarea = screen.getByLabelText(/input mapping/i);
    fireEvent.change(textarea, { target: { value: '{ not json' } });

    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((el) => /invalid json/i.test(el.textContent ?? ''))).toBe(true);
    expect(updateNodeConfig).not.toHaveBeenCalledWith(
      NODE_ID,
      expect.objectContaining({ inputMapping: expect.anything() }),
    );
  });

  it('should reject an array as input mapping (object required)', () => {
    const updateNodeConfig = vi.fn();
    useEditorStore.setState({ updateNodeConfig });

    render(<SubworkflowForm nodeId={NODE_ID} config={{}} />);
    const textarea = screen.getByLabelText(/input mapping/i);
    fireEvent.change(textarea, { target: { value: '[1,2,3]' } });

    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((el) => /must be a json object/i.test(el.textContent ?? ''))).toBe(true);
  });
});
