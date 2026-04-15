import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider, type NodeProps } from 'reactflow';
import { NodeType } from '@tietide/shared';
import { CustomNode } from './CustomNode';
import type { CustomNodeData } from './CustomNode.types';

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
    it.each([
      ['idle', 'status-idle'],
      ['running', 'status-running'],
      ['success', 'status-success'],
      ['failed', 'status-failed'],
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
