import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider, type NodeProps } from 'reactflow';
import { NodeType } from '@tietide/shared';
import { CustomNode } from './CustomNode';
import type { CustomNodeData } from './CustomNode.types';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { useExecutionLiveStore, type NodeRunState } from '@/stores/executionLiveStore';

const baseRunState = (overrides: Partial<NodeRunState> = {}): NodeRunState => ({
  status: 'running',
  nodeType: 'http-request',
  startedAt: null,
  finishedAt: null,
  durationMs: null,
  input: null,
  output: null,
  error: null,
  ...overrides,
});

type Props = Partial<NodeProps<CustomNodeData>> & { data: CustomNodeData };

const renderNode = (props: Props) => {
  const merged: NodeProps<CustomNodeData> = {
    id: 'node-1',
    type: 'custom',
    data: props.data,
    selected: props.selected ?? false,
    isConnectable: true,
    xPos: 0,
    yPos: 0,
    zIndex: 0,
    dragging: false,
    targetPosition: undefined,
    sourcePosition: undefined,
  };
  return render(
    <ReactFlowProvider>
      <CustomNode {...merged} />
    </ReactFlowProvider>,
  );
};

describe('CustomNode', () => {
  describe('rendering', () => {
    it('should render title, description, icon, and status ring', () => {
      renderNode({
        data: {
          label: 'Send Email',
          description: 'Send transactional email',
          nodeType: NodeType.HTTP_REQUEST,
          status: 'idle',
        },
      });

      expect(screen.getByText('Send Email')).toBeInTheDocument();
      expect(screen.getByText('Send transactional email')).toBeInTheDocument();
      expect(screen.getByTestId('custom-node')).toBeInTheDocument();
      expect(screen.getByTestId('custom-node-icon')).toBeInTheDocument();
      expect(screen.getByTestId('custom-node-ring')).toBeInTheDocument();
    });

    it('should render without description', () => {
      renderNode({
        data: {
          label: 'Manual Trigger',
          nodeType: NodeType.MANUAL_TRIGGER,
          status: 'idle',
        },
      });

      expect(screen.getByText('Manual Trigger')).toBeInTheDocument();
      expect(screen.queryByTestId('custom-node-description')).not.toBeInTheDocument();
    });

    it('should default to idle status when status is undefined', () => {
      renderNode({
        data: {
          label: 'No status',
          nodeType: NodeType.MANUAL_TRIGGER,
        },
      });

      expect(screen.getByTestId('custom-node-ring')).toHaveAttribute('data-status', 'idle');
    });
  });

  describe('icon mapping', () => {
    it.each([
      [NodeType.MANUAL_TRIGGER],
      [NodeType.CRON_TRIGGER],
      [NodeType.WEBHOOK_TRIGGER],
      [NodeType.HTTP_REQUEST],
      [NodeType.CODE],
      [NodeType.CONDITIONAL],
    ])('should render an icon for nodeType=%s', (nodeType) => {
      renderNode({
        data: { label: 'n', nodeType, status: 'idle' },
      });
      const icon = screen.getByTestId('custom-node-icon');
      expect(icon).toBeInTheDocument();
      expect(icon.querySelector('svg')).toBeInTheDocument();
    });

    it('should fall back to a default icon for unknown node types', () => {
      renderNode({
        data: {
          label: 'Unknown',
          // cast so we can simulate an unknown type reaching the component
          nodeType: 'something-unknown' as unknown as CustomNodeData['nodeType'],
          status: 'idle',
        },
      });
      expect(screen.getByTestId('custom-node-icon').querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('status ring', () => {
    beforeEach(() => {
      useExecutionLiveStore.getState().reset();
    });

    it.each([
      ['idle', 'status-idle'],
      ['running', 'status-running'],
      ['success', 'status-success'],
      ['failed', 'status-failed'],
      ['skipped', 'status-idle'],
    ] as const)('should apply %s color when status=%s', (status, expectedClassFragment) => {
      renderNode({
        data: {
          label: 'n',
          nodeType: NodeType.MANUAL_TRIGGER,
          status,
        },
      });
      const ring = screen.getByTestId('custom-node-ring');
      expect(ring).toHaveAttribute('data-status', status);
      expect(ring.className).toContain(expectedClassFragment);
    });

    it('should apply a pulse animation class when status is running', () => {
      renderNode({
        data: {
          label: 'n',
          nodeType: NodeType.MANUAL_TRIGGER,
          status: 'running',
        },
      });
      expect(screen.getByTestId('custom-node-ring').className).toContain('animate-pulse-ring');
    });
  });

  describe('live execution status override', () => {
    beforeEach(() => {
      useExecutionLiveStore.getState().reset();
    });

    it('should reflect status from executionLiveStore when present', () => {
      useExecutionLiveStore.setState({
        nodes: new Map([['node-1', baseRunState({ status: 'running' })]]),
      });
      renderNode({
        data: { label: 'n', nodeType: NodeType.HTTP_REQUEST, status: 'idle' },
      });
      expect(screen.getByTestId('custom-node-ring')).toHaveAttribute('data-status', 'running');
    });

    it('should override data.status (success ring takes over after completion)', () => {
      useExecutionLiveStore.setState({
        nodes: new Map([['node-1', baseRunState({ status: 'success' })]]),
      });
      renderNode({
        data: { label: 'n', nodeType: NodeType.HTTP_REQUEST, status: 'running' },
      });
      expect(screen.getByTestId('custom-node-ring')).toHaveAttribute('data-status', 'success');
    });

    it('should fall back to data.status when no live entry exists for this node', () => {
      useExecutionLiveStore.setState({
        nodes: new Map([['other-node', baseRunState({ status: 'running' })]]),
      });
      renderNode({
        data: { label: 'n', nodeType: NodeType.HTTP_REQUEST, status: 'failed' },
      });
      expect(screen.getByTestId('custom-node-ring')).toHaveAttribute('data-status', 'failed');
    });
  });

  describe('selection', () => {
    it('should apply the teal selection ring when selected', () => {
      renderNode({
        data: { label: 'n', nodeType: NodeType.MANUAL_TRIGGER, status: 'idle' },
        selected: true,
      });
      expect(screen.getByTestId('custom-node')).toHaveAttribute('data-selected', 'true');
    });

    it('should not apply the selection ring when not selected', () => {
      renderNode({
        data: { label: 'n', nodeType: NodeType.MANUAL_TRIGGER, status: 'idle' },
        selected: false,
      });
      expect(screen.getByTestId('custom-node')).toHaveAttribute('data-selected', 'false');
    });
  });

  describe('handles', () => {
    it('should render a target handle on top and a source handle on bottom', () => {
      const { container } = renderNode({
        data: { label: 'n', nodeType: NodeType.MANUAL_TRIGGER, status: 'idle' },
      });

      const handles = container.querySelectorAll('.react-flow__handle');
      expect(handles.length).toBe(2);

      const target = container.querySelector('.react-flow__handle-top');
      const source = container.querySelector('.react-flow__handle-bottom');
      expect(target).not.toBeNull();
      expect(source).not.toBeNull();
      expect(target?.className).toContain('target');
      expect(source?.className).toContain('source');
    });
  });

  describe('skip toggle', () => {
    beforeEach(() => {
      useEditorStore.setState({ ...initialEditorState });
    });

    it('should render a skip-toggle button in the header', () => {
      renderNode({
        data: { label: 'n', nodeType: NodeType.HTTP_REQUEST, status: 'idle' },
      });
      expect(screen.getByTestId('custom-node-skip-toggle')).toBeInTheDocument();
    });

    it('should call editorStore.toggleNodeSkip with the node id when clicked', async () => {
      const toggleNodeSkip = vi.fn();
      useEditorStore.setState({ toggleNodeSkip });

      renderNode({
        data: { label: 'n', nodeType: NodeType.HTTP_REQUEST, status: 'idle' },
      });

      const user = userEvent.setup();
      await user.click(screen.getByTestId('custom-node-skip-toggle'));

      expect(toggleNodeSkip).toHaveBeenCalledWith('node-1');
    });

    it('should apply opacity-50 and a dashed outline when data.skipped is true', () => {
      renderNode({
        data: { label: 'n', nodeType: NodeType.HTTP_REQUEST, status: 'idle', skipped: true },
      });
      const root = screen.getByTestId('custom-node');
      expect(root).toHaveAttribute('data-skipped', 'true');
      expect(root.className).toContain('opacity-50');
      expect(
        root.className.includes('border-dashed') || root.className.includes('outline-dashed'),
      ).toBe(true);
    });

    it('should render a SKIPPED badge in the node body when data.skipped is true', () => {
      renderNode({
        data: { label: 'n', nodeType: NodeType.HTTP_REQUEST, status: 'idle', skipped: true },
      });
      expect(screen.getByTestId('custom-node-skipped-badge')).toHaveTextContent(/skipped/i);
    });

    it('should not render the SKIPPED badge when data.skipped is falsy', () => {
      renderNode({
        data: { label: 'n', nodeType: NodeType.HTTP_REQUEST, status: 'idle' },
      });
      expect(screen.queryByTestId('custom-node-skipped-badge')).not.toBeInTheDocument();
    });

    it.each([[NodeType.MANUAL_TRIGGER], [NodeType.CRON_TRIGGER], [NodeType.WEBHOOK_TRIGGER]])(
      'should not render the skip toggle on trigger nodeType=%s',
      (nodeType) => {
        renderNode({
          data: { label: 'Trigger', nodeType, status: 'idle' },
        });
        expect(screen.queryByTestId('custom-node-skip-toggle')).not.toBeInTheDocument();
      },
    );
  });

  describe('memoization', () => {
    it('should be wrapped in React.memo', () => {
      const memoSymbol = Symbol.for('react.memo');
      expect((CustomNode as unknown as { $$typeof: symbol }).$$typeof).toBe(memoSymbol);
    });

    it('should expose a displayName of "CustomNode"', () => {
      expect((CustomNode as unknown as { displayName?: string }).displayName).toBe('CustomNode');
    });
  });
});
