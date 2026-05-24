import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NodeType } from '@tietide/shared';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { initialToastState, useToastStore } from '@/stores/toastStore';

// Stub React Flow's hook: echo the screen point back as the flow position.
vi.mock('reactflow', () => ({
  useReactFlow: () => ({ screenToFlowPosition: (p: { x: number; y: number }) => p }),
}));

// Stub the node library so the test drives a deterministic pick without
// rendering the full catalog.
vi.mock('./NodeLibrary', () => ({
  NodeLibrary: ({ onPickNode }: { onPickNode?: (t: NodeType) => void }) => (
    <button
      type="button"
      data-testid="stub-pick"
      onClick={() => onPickNode?.(NodeType.MANUAL_TRIGGER)}
    >
      pick trigger
    </button>
  ),
  NODE_LIBRARY_DRAG_MIME: 'application/reactflow-node-type',
}));

import { EditorMobileToolbox } from './EditorMobileToolbox';

describe('EditorMobileToolbox', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
    useToastStore.setState({ ...initialToastState });
  });

  it('renders a floating add-node button', () => {
    render(<EditorMobileToolbox />);
    expect(screen.getByTestId('mobile-add-node-fab')).toBeInTheDocument();
  });

  it('opens the node library sheet when the add button is tapped', async () => {
    const user = userEvent.setup();
    render(<EditorMobileToolbox />);
    expect(screen.queryByRole('dialog', { name: /add a node/i })).toBeNull();

    await user.click(screen.getByTestId('mobile-add-node-fab'));

    expect(screen.getByRole('dialog', { name: /add a node/i })).toBeInTheDocument();
  });

  it('adds the picked node and closes the sheet', async () => {
    const user = userEvent.setup();
    render(<EditorMobileToolbox />);

    await user.click(screen.getByTestId('mobile-add-node-fab'));
    await user.click(screen.getByTestId('stub-pick'));

    expect(useEditorStore.getState().nodes).toHaveLength(1);
    expect(useEditorStore.getState().nodes[0].data.nodeType).toBe(NodeType.MANUAL_TRIGGER);
    expect(screen.queryByRole('dialog', { name: /add a node/i })).toBeNull();
  });

  it('shows an error toast and keeps the sheet open when a second trigger is rejected', async () => {
    const user = userEvent.setup();
    // Seed an existing trigger so the workflow already has one.
    useEditorStore.setState({
      nodes: [
        {
          id: 'existing-trigger',
          type: 'custom',
          position: { x: 0, y: 0 },
          data: { label: 'Manual', nodeType: NodeType.MANUAL_TRIGGER, status: 'idle', config: {} },
        },
      ],
    });
    render(<EditorMobileToolbox />);

    await user.click(screen.getByTestId('mobile-add-node-fab'));
    await user.click(screen.getByTestId('stub-pick'));

    expect(useEditorStore.getState().nodes).toHaveLength(1);
    expect(useToastStore.getState().toasts.some((t) => t.tone === 'error')).toBe(true);
    expect(screen.getByRole('dialog', { name: /add a node/i })).toBeInTheDocument();
  });
});
