import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NODE_CATALOG, NodeType } from '@tietide/shared';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { NodeConfigPanel } from './NodeConfigPanel';

// Bypasses editorStore.addNode (which blocks forbidden types per FORBIDDEN_NODE_TYPES)
// so we can verify form dispatch for any node type — including types that exist in
// loaded definitions but cannot be added via the palette.
const seedNodeOfType = (nodeType: NodeType): string => {
  const def = NODE_CATALOG.find((d) => d.type === nodeType);
  if (!def) throw new Error(`Unknown node type: ${nodeType}`);
  const nodeId = `node-test-${nodeType}`;
  useEditorStore.setState({
    ...initialEditorState,
    nodes: [
      {
        id: nodeId,
        type: 'custom',
        position: { x: 0, y: 0 },
        data: {
          label: def.name,
          description: def.description,
          nodeType: def.type,
          status: 'idle',
          config: {},
        },
      },
    ],
    selectedNodeId: nodeId,
  });
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

  describe('error handler toggle', () => {
    it('should render an "Add error handler" toggle in the panel', () => {
      seedNodeOfType(NodeType.HTTP_REQUEST);
      render(<NodeConfigPanel />);
      expect(screen.getByTestId('node-config-error-handler-toggle')).toBeInTheDocument();
    });

    it('should reflect data.config.hasErrorHandler === true as a checked toggle', () => {
      const nodeId = seedNodeOfType(NodeType.HTTP_REQUEST);
      useEditorStore.getState().updateNodeConfig(nodeId, { hasErrorHandler: true });
      render(<NodeConfigPanel />);
      const toggle = screen.getByTestId('node-config-error-handler-toggle') as HTMLInputElement;
      expect(toggle.checked).toBe(true);
    });

    it('should call updateNodeConfig with hasErrorHandler:true when toggled on', () => {
      const nodeId = seedNodeOfType(NodeType.HTTP_REQUEST);
      render(<NodeConfigPanel />);
      const toggle = screen.getByTestId('node-config-error-handler-toggle') as HTMLInputElement;
      expect(toggle.checked).toBe(false);

      fireEvent.click(toggle);

      const updatedConfig = useEditorStore.getState().nodes.find((n) => n.id === nodeId)
        ?.data.config;
      expect(updatedConfig).toMatchObject({ hasErrorHandler: true });
    });

    it('should call updateNodeConfig with hasErrorHandler:false when toggled off', () => {
      const nodeId = seedNodeOfType(NodeType.HTTP_REQUEST);
      useEditorStore.getState().updateNodeConfig(nodeId, { hasErrorHandler: true });
      render(<NodeConfigPanel />);
      const toggle = screen.getByTestId('node-config-error-handler-toggle') as HTMLInputElement;
      expect(toggle.checked).toBe(true);

      fireEvent.click(toggle);

      const updatedConfig = useEditorStore.getState().nodes.find((n) => n.id === nodeId)
        ?.data.config;
      expect(updatedConfig).toMatchObject({ hasErrorHandler: false });
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
