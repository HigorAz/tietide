import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { NODE_CATALOG, NodeType } from '@tietide/shared';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import {
  initialExecutionLiveState,
  useExecutionLiveStore,
  type NodeRunState,
} from '@/stores/executionLiveStore';
import { mockViewport, restoreViewport } from '@/test/matchMedia';
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
    useExecutionLiveStore.setState({ ...initialExecutionLiveState, nodes: new Map() });
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

    it('should render the live Preview panel in the footer', () => {
      seedNodeOfType(NodeType.HTTP_REQUEST);
      render(<NodeConfigPanel />);
      expect(screen.getByTestId('node-preview-panel')).toBeInTheDocument();
      expect(screen.getByTestId('node-preview-toggle')).toBeInTheDocument();
      expect(screen.getByTestId('node-preview-toggle')).not.toBeDisabled();
    });

    it('should clear the selection when the close button is clicked', () => {
      const nodeId = seedNodeOfType(NodeType.HTTP_REQUEST);
      expect(useEditorStore.getState().selectedNodeId).toBe(nodeId);

      render(<NodeConfigPanel />);
      fireEvent.click(screen.getByTestId('node-config-close'));

      expect(useEditorStore.getState().selectedNodeId).toBeNull();
    });

    it('should expose a resize handle and apply an explicit width', () => {
      seedNodeOfType(NodeType.HTTP_REQUEST);
      render(<NodeConfigPanel />);
      expect(screen.getByTestId('node-config-resize')).toBeInTheDocument();
      expect(screen.getByTestId('node-config-panel').style.width).toBe('320px');
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

  describe('mobile (bottom sheet)', () => {
    beforeEach(() => mockViewport('mobile'));
    afterEach(() => restoreViewport());

    it('should render the panel as a dialog (bottom sheet) when a node is selected', () => {
      seedNodeOfType(NodeType.HTTP_REQUEST);
      render(<NodeConfigPanel />);
      expect(screen.getByRole('dialog', { name: /http request/i })).toBeInTheDocument();
      expect(screen.getByTestId('http-request-form')).toBeInTheDocument();
    });

    it('should clear the selection when the sheet close button is clicked', () => {
      const nodeId = seedNodeOfType(NodeType.HTTP_REQUEST);
      expect(useEditorStore.getState().selectedNodeId).toBe(nodeId);

      render(<NodeConfigPanel />);
      fireEvent.click(screen.getByRole('button', { name: /^close$/i }));

      expect(useEditorStore.getState().selectedNodeId).toBeNull();
    });

    it('should still render the live Preview panel inside the sheet', () => {
      seedNodeOfType(NodeType.HTTP_REQUEST);
      render(<NodeConfigPanel />);
      expect(screen.getByTestId('node-preview-panel')).toBeInTheDocument();
    });
  });

  describe('view mode (configure vs result)', () => {
    const baseRunState = (overrides: Partial<NodeRunState> = {}): NodeRunState => ({
      status: 'success',
      nodeType: 'http-request',
      startedAt: '2026-05-23T12:00:00.000Z',
      finishedAt: '2026-05-23T12:00:01.000Z',
      durationMs: 1000,
      input: null,
      output: null,
      error: null,
      ...overrides,
    });

    // Switch the editor into the Result view, keeping the seeded node/selection.
    const enterResultView = (): void => useEditorStore.setState({ viewMode: 'result' });

    // Seed a live run for `nodeId` (used by the Result view's inspection).
    const seedRun = (nodeId: string, overrides: Partial<NodeRunState> = {}): void => {
      useExecutionLiveStore.setState({
        ...initialExecutionLiveState,
        mode: 'replay',
        executionId: 'exec-1',
        nodes: new Map([[nodeId, baseRunState(overrides)]]),
      });
    };

    it('should render the editable config form in configure view (default)', () => {
      seedNodeOfType(NodeType.HTTP_REQUEST);
      render(<NodeConfigPanel />);
      expect(screen.getByTestId('http-request-form')).toBeInTheDocument();
      expect(screen.queryByTestId('node-run-inspection')).not.toBeInTheDocument();
    });

    it('should keep the config form editable in configure view even while a run is loaded', () => {
      const nodeId = seedNodeOfType(NodeType.HTTP_REQUEST);
      // A run is loaded, but the user is on the Configure tab.
      seedRun(nodeId, { input: { url: 'https://api.example.com' } });
      // viewMode stays 'configure' (seedRun touches only the live store).

      render(<NodeConfigPanel />);
      // The editable form is present (not the read-only inspection) — editing
      // is no longer blocked during/after a run.
      expect(screen.getByTestId('http-request-form')).toBeInTheDocument();
      expect(screen.queryByTestId('node-run-inspection')).not.toBeInTheDocument();
    });

    it('should dispatch config edits while a run is loaded in configure view', () => {
      const nodeId = seedNodeOfType(NodeType.HTTP_REQUEST);
      seedRun(nodeId);

      render(<NodeConfigPanel />);
      const toggle = screen.getByTestId('node-config-error-handler-toggle');
      fireEvent.click(toggle);

      const node = useEditorStore.getState().nodes.find((n) => n.id === nodeId);
      expect(node?.data.config?.hasErrorHandler).toBe(true);
    });

    it('should render the run inspection (not the form) in result view', () => {
      const nodeId = seedNodeOfType(NodeType.HTTP_REQUEST);
      seedRun(nodeId, {
        input: { url: 'https://api.example.com' },
        output: { ok: true, status: 200 },
      });
      enterResultView();

      render(<NodeConfigPanel />);
      expect(screen.queryByTestId('http-request-form')).not.toBeInTheDocument();
      expect(screen.getByTestId('node-run-inspection')).toBeInTheDocument();
    });

    it('should show this node’s input and output data in result view', () => {
      const nodeId = seedNodeOfType(NodeType.HTTP_REQUEST);
      seedRun(nodeId, {
        input: { url: 'https://api.example.com' },
        output: { ok: true, status: 201 },
      });
      enterResultView();

      render(<NodeConfigPanel />);
      // Input + Output sections are open by default; the shared DataViewer (Tree
      // mode) surfaces the values.
      expect(screen.getByTestId('node-run-input')).toHaveTextContent('api.example.com');
      expect(screen.getByTestId('node-run-output')).toHaveTextContent('201');
    });

    it('should show a "not executed" hint in result view when this node has no run data', () => {
      seedNodeOfType(NodeType.HTTP_REQUEST);
      useExecutionLiveStore.setState({
        ...initialExecutionLiveState,
        mode: 'replay',
        executionId: 'exec-1',
        nodes: new Map(),
      });
      enterResultView();

      render(<NodeConfigPanel />);
      expect(screen.getByTestId('node-run-inspection')).toBeInTheDocument();
      expect(screen.getByText(/not executed/i)).toBeInTheDocument();
    });

    it('should render the labeled config field list in run inspection', () => {
      const nodeId = seedNodeOfType(NodeType.HTTP_REQUEST);
      useEditorStore.getState().updateNodeConfig(nodeId, { url: 'https://example.com' });
      seedRun(nodeId);
      enterResultView();

      render(<NodeConfigPanel />);
      // Configuration is collapsed by default — expand its section to reveal the
      // labeled field list (never a JSON blob, per the locked decision).
      const configCard = screen.getByTestId('run-section-card-configuration');
      fireEvent.click(within(configCard).getByRole('button', { name: /configuration/i }));
      expect(screen.getByTestId('config-field-list')).toHaveTextContent('https://example.com');
    });

    it('should render the error block when the selected node failed (result view)', () => {
      const nodeId = seedNodeOfType(NodeType.HTTP_REQUEST);
      seedRun(nodeId, {
        status: 'failed',
        error: { message: 'Connection "abc-123" not found', code: 'CONN_MISSING' },
      });
      enterResultView();

      render(<NodeConfigPanel />);
      const errorBlock = screen.getByTestId('node-run-error');
      expect(errorBlock).toHaveTextContent('Connection "abc-123" not found');
      expect(errorBlock).toHaveTextContent('CONN_MISSING');
    });

    it('should hide the live Preview panel in result view', () => {
      const nodeId = seedNodeOfType(NodeType.HTTP_REQUEST);
      seedRun(nodeId);
      enterResultView();

      render(<NodeConfigPanel />);
      expect(screen.queryByTestId('node-preview-toggle')).not.toBeInTheDocument();
    });

    it('should show the live Preview panel in configure view while a run is loaded', () => {
      const nodeId = seedNodeOfType(NodeType.HTTP_REQUEST);
      seedRun(nodeId);
      // stays in configure view

      render(<NodeConfigPanel />);
      expect(screen.getByTestId('node-preview-panel')).toBeInTheDocument();
    });
  });
});
