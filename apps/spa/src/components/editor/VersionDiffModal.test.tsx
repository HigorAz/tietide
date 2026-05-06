import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useEditorStore } from '@/stores/editorStore';
import { useVersionsStore } from '@/stores/versionsStore';
import * as api from '@/api/workflowVersions';
import { VersionDiffModal } from './VersionDiffModal';

vi.mock('@/api/workflowVersions');

vi.mock('reactflow', () => ({
  __esModule: true,
  default: ({ nodes }: { nodes: Array<{ id: string; data: { versionState?: string } }> }) => (
    <div data-testid="reactflow-stub">
      {nodes.map((n) => (
        <div key={n.id} data-node-id={n.id} data-version-state={n.data.versionState ?? 'none'} />
      ))}
    </div>
  ),
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const node = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  type: 'manual-trigger',
  name: 'Start',
  position: { x: 0, y: 0 },
  config: {},
  ...overrides,
});

const workflowId = 'workflow-uuid-1';

describe('VersionDiffModal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useVersionsStore.getState().reset();
    useEditorStore.setState({
      workflowId,
      nodes: [],
      edges: [],
      isDirty: false,
      selectedNodeId: null,
      past: [],
      future: [],
      entryRoute: null,
    });
  });

  it('should mark added/removed/modified nodes in the canvas pane', async () => {
    vi.mocked(api.getWorkflowVersion).mockResolvedValue({
      id: 'v1',
      workflowId,
      version: 1,
      definition: {
        nodes: [node('keep'), node('remove'), node('mod', { name: 'Old' })],
        edges: [],
      },
      message: null,
      createdAt: new Date().toISOString(),
      createdBy: null,
    });

    // Live editor state (the "to" side)
    useEditorStore.setState({
      workflowId,
      nodes: [
        {
          id: 'keep',
          type: 'custom',
          position: { x: 0, y: 0 },
          data: { label: 'Start', nodeType: 'manual-trigger', config: {} },
        },
        {
          id: 'mod',
          type: 'custom',
          position: { x: 100, y: 0 },
          data: { label: 'New', nodeType: 'manual-trigger', config: {} },
        },
        {
          id: 'add',
          type: 'custom',
          position: { x: 200, y: 0 },
          data: { label: 'Start', nodeType: 'manual-trigger', config: {} },
        },
      ],
      edges: [],
      isDirty: false,
      selectedNodeId: null,
      past: [],
      future: [],
      entryRoute: null,
    });

    render(<VersionDiffModal workflowId={workflowId} fromVersion={1} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId('reactflow-stub')).toBeInTheDocument();
    });

    const stub = screen.getByTestId('reactflow-stub');
    const byId = (id: string) => stub.querySelector(`[data-node-id="${id}"]`);

    expect(byId('add')?.getAttribute('data-version-state')).toBe('added');
    expect(byId('remove')?.getAttribute('data-version-state')).toBe('removed');
    expect(byId('mod')?.getAttribute('data-version-state')).toBe('modified');
    expect(byId('keep')?.getAttribute('data-version-state')).toBe('none');
  });

  it('should render the JSON diff pane', async () => {
    vi.mocked(api.getWorkflowVersion).mockResolvedValue({
      id: 'v1',
      workflowId,
      version: 1,
      definition: { nodes: [node('a')], edges: [] },
      message: null,
      createdAt: new Date().toISOString(),
      createdBy: null,
    });

    render(<VersionDiffModal workflowId={workflowId} fromVersion={1} onClose={() => {}} />);

    expect(await screen.findByTestId('version-diff-json')).toBeInTheDocument();
  });

  it('should show error when fetch fails', async () => {
    vi.mocked(api.getWorkflowVersion).mockRejectedValue(new Error('boom'));

    render(<VersionDiffModal workflowId={workflowId} fromVersion={1} onClose={() => {}} />);

    expect(await screen.findByText(/boom/i)).toBeInTheDocument();
  });
});
