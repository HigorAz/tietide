import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NodeType } from '@tietide/shared';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { NodeConfigPanel } from './NodeConfigPanel';

const seedNodeOfType = (nodeType: NodeType): string => {
  useEditorStore.setState({ ...initialEditorState });
  useEditorStore.getState().addNode(nodeType, { x: 0, y: 0 });
  const nodeId = useEditorStore.getState().nodes[0].id;
  useEditorStore.getState().selectNode(nodeId);
  return nodeId;
};

describe('NodeConfigPanel', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
  });

  describe('empty state', () => {
    it('should render nothing when no node is selected', () => {
      const { container } = render(<NodeConfigPanel />);
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('dispatching to forms by node type', () => {
    it('should render the HTTP Request form when an HTTP node is selected', () => {
      seedNodeOfType(NodeType.HTTP_REQUEST);
      render(<NodeConfigPanel />);
      expect(screen.getByTestId('http-request-form')).toBeInTheDocument();
    });

    it('should render the Cron form when a Cron trigger is selected', () => {
      seedNodeOfType(NodeType.CRON_TRIGGER);
      render(<NodeConfigPanel />);
      expect(screen.getByTestId('cron-form')).toBeInTheDocument();
    });

    it('should render the Webhook form when a Webhook trigger is selected', () => {
      seedNodeOfType(NodeType.WEBHOOK_TRIGGER);
      render(<NodeConfigPanel />);
      expect(screen.getByTestId('webhook-form')).toBeInTheDocument();
    });

    it('should render the Conditional form when a Conditional node is selected', () => {
      seedNodeOfType(NodeType.CONDITIONAL);
      render(<NodeConfigPanel />);
      expect(screen.getByTestId('conditional-form')).toBeInTheDocument();
    });

    it('should render the Code form when a Code node is selected', () => {
      seedNodeOfType(NodeType.CODE);
      render(<NodeConfigPanel />);
      expect(screen.getByTestId('code-form')).toBeInTheDocument();
    });

    it('should render the Manual Trigger placeholder form for manual triggers', () => {
      seedNodeOfType(NodeType.MANUAL_TRIGGER);
      render(<NodeConfigPanel />);
      expect(screen.getByTestId('manual-trigger-form')).toBeInTheDocument();
    });
  });

  describe('panel chrome', () => {
    it('should render the selected node label in the header', () => {
      seedNodeOfType(NodeType.HTTP_REQUEST);
      render(<NodeConfigPanel />);
      expect(screen.getByRole('heading', { name: /HTTP Request/i })).toBeInTheDocument();
    });

    it('should render a disabled Preview button with a tooltip', () => {
      seedNodeOfType(NodeType.HTTP_REQUEST);
      render(<NodeConfigPanel />);
      const preview = screen.getByTestId('node-preview-button');
      expect(preview).toBeDisabled();
      expect(preview).toHaveAttribute('title');
    });

    it('should clear the selection when the close button is clicked', () => {
      const nodeId = seedNodeOfType(NodeType.HTTP_REQUEST);
      expect(useEditorStore.getState().selectedNodeId).toBe(nodeId);

      render(<NodeConfigPanel />);
      fireEvent.click(screen.getByTestId('node-config-close'));

      expect(useEditorStore.getState().selectedNodeId).toBeNull();
    });
  });

  describe('fallback', () => {
    it('should render a fallback message when the selected node id does not match any node', () => {
      useEditorStore.setState({
        ...initialEditorState,
        selectedNodeId: 'node-ghost-xyz',
      });
      render(<NodeConfigPanel />);
      expect(screen.getByText(/no node selected/i)).toBeInTheDocument();
    });
  });
});
