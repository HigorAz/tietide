import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEditorStore } from '@/stores/editorStore';
import { useVersionsStore } from '@/stores/versionsStore';
import * as api from '@/api/workflowVersions';
import { VersionHistoryPanel } from './VersionHistoryPanel';

vi.mock('@/api/workflowVersions');

const summary = (version: number, message: string | null = null) => {
  // Spread versions across days so the timestamp is always valid.
  const day = String(((version - 1) % 28) + 1).padStart(2, '0');
  return {
    id: `v${version}`,
    version,
    message,
    createdAt: new Date(`2026-05-${day}T10:00:00Z`).toISOString(),
    createdBy: { id: 'u1', email: 'u@example.com' },
  };
};

const baseDefinition = { nodes: [], edges: [] };

describe('VersionHistoryPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useVersionsStore.getState().reset();
    useEditorStore.setState({
      workflowId: 'workflow-uuid-1',
      nodes: [],
      edges: [],
      isDirty: false,
      selectedNodeId: null,
      past: [],
      future: [],
      entryRoute: null,
    });
  });

  it('should render a vertical timeline of versions', async () => {
    vi.mocked(api.listWorkflowVersions).mockResolvedValue({
      items: [summary(3, 'edit'), summary(2), summary(1, 'initial')],
      nextCursor: null,
    });

    render(<VersionHistoryPanel />);

    expect(await screen.findByText('v3')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('edit')).toBeInTheDocument();
    expect(screen.getByText('initial')).toBeInTheDocument();
  });

  it('should call editorStore.loadWorkflow when Restore is clicked', async () => {
    vi.mocked(api.listWorkflowVersions).mockResolvedValue({
      items: [summary(2)],
      nextCursor: null,
    });
    vi.mocked(api.restoreWorkflowVersion).mockResolvedValue({
      version: 2,
      definition: baseDefinition,
    });
    const loadWorkflowSpy = vi.fn();
    useEditorStore.setState({ loadWorkflow: loadWorkflowSpy });

    const user = userEvent.setup();
    render(<VersionHistoryPanel />);

    await screen.findByText('v2');
    await user.click(screen.getByRole('button', { name: /restore v2/i }));

    await waitFor(() => {
      expect(api.restoreWorkflowVersion).toHaveBeenCalledWith('workflow-uuid-1', 2);
      expect(loadWorkflowSpy).toHaveBeenCalledWith({
        id: 'workflow-uuid-1',
        definition: baseDefinition,
      });
    });
  });

  it('should show empty state when there are no versions', async () => {
    vi.mocked(api.listWorkflowVersions).mockResolvedValue({ items: [], nextCursor: null });

    render(<VersionHistoryPanel />);

    expect(await screen.findByText(/no versions yet/i)).toBeInTheDocument();
  });

  it('should show error state when fetch fails', async () => {
    vi.mocked(api.listWorkflowVersions).mockRejectedValue(new Error('network down'));

    render(<VersionHistoryPanel />);

    expect(await screen.findByText(/network down/i)).toBeInTheDocument();
  });

  it('should render Load more button when nextCursor is present', async () => {
    vi.mocked(api.listWorkflowVersions).mockResolvedValue({
      items: [summary(20), summary(19)],
      nextCursor: 'cursor-1',
    });

    render(<VersionHistoryPanel />);

    expect(await screen.findByRole('button', { name: /load more/i })).toBeInTheDocument();
  });
});
