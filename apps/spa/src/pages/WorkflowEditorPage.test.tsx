import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { NodeType, type Workflow } from '@tietide/shared';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';

vi.mock('reactflow/dist/style.css', () => ({}));
vi.mock('reactflow', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="reactflow-stub">{children}</div>
  ),
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReactFlow: () => ({ screenToFlowPosition: (p: { x: number; y: number }) => p }),
}));

vi.mock('@/api/workflows', () => ({
  getWorkflow: vi.fn(),
  updateWorkflow: vi.fn(),
}));

import { getWorkflow } from '@/api/workflows';
import { WorkflowEditorPage } from './WorkflowEditorPage';

const mockedGet = vi.mocked(getWorkflow);

const sampleWorkflow: Workflow = {
  id: 'wf-abc',
  name: 'Sample',
  description: null,
  definition: {
    nodes: [
      {
        id: 'n-1',
        type: NodeType.MANUAL_TRIGGER,
        name: 'Start',
        position: { x: 0, y: 0 },
        config: {},
      },
    ],
    edges: [],
  },
  isActive: true,
  version: 1,
  userId: 'user-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const renderAtId = (id: string) =>
  render(
    <MemoryRouter initialEntries={[`/workflows/${id}`]}>
      <Routes>
        <Route path="/workflows/:id" element={<WorkflowEditorPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('WorkflowEditorPage', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
    mockedGet.mockReset();
  });

  it('should show a loading state while the workflow request is in flight', () => {
    mockedGet.mockReturnValue(new Promise(() => {}));

    renderAtId('wf-abc');

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('should render the canvas, node library, config panel, and toolbar after loading', async () => {
    mockedGet.mockResolvedValueOnce(sampleWorkflow);

    renderAtId('wf-abc');

    await waitFor(() => expect(screen.getByTestId('editor-toolbar')).toBeInTheDocument());
    expect(screen.getByTestId('node-library')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-dropzone')).toBeInTheDocument();

    const state = useEditorStore.getState();
    expect(state.workflowId).toBe('wf-abc');
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0].data.nodeType).toBe(NodeType.MANUAL_TRIGGER);
    expect(state.isDirty).toBe(false);
  });

  it('should render an error state when the workflow fetch rejects', async () => {
    mockedGet.mockRejectedValueOnce(new Error('not found'));

    renderAtId('wf-abc');

    await waitFor(() => expect(screen.getByText(/failed to load workflow/i)).toBeInTheDocument());
  });

  it('should reset the editor store on unmount', async () => {
    mockedGet.mockResolvedValueOnce(sampleWorkflow);

    const { unmount } = renderAtId('wf-abc');
    await waitFor(() => expect(useEditorStore.getState().nodes).toHaveLength(1));

    unmount();

    const state = useEditorStore.getState();
    expect(state.nodes).toHaveLength(0);
    expect(state.workflowId).toBeNull();
  });
});
