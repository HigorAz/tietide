import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider, Position, type EdgeProps } from 'reactflow';
import { LivingInkEdge } from './LivingInkEdge';
import { initialEditorState, useEditorStore } from '@/stores/editorStore';
import { useExecutionLiveStore, type NodeRunState } from '@/stores/executionLiveStore';

const baseRunState = (overrides: Partial<NodeRunState>): NodeRunState => ({
  status: 'idle',
  nodeType: null,
  startedAt: null,
  finishedAt: null,
  durationMs: null,
  input: null,
  output: null,
  error: null,
  ...overrides,
});

const seedActiveSegment = (sourceId: string, targetId: string): void => {
  useExecutionLiveStore.setState({
    nodes: new Map([
      [sourceId, baseRunState({ status: 'success' })],
      [targetId, baseRunState({ status: 'running' })],
    ]),
  });
};

const renderEdge = (overrides: Partial<EdgeProps> = {}) => {
  const props: EdgeProps = {
    id: 'edge-1',
    source: 'node-a',
    target: 'node-b',
    sourceX: 0,
    sourceY: 0,
    targetX: 100,
    targetY: 200,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    selected: false,
    animated: false,
    data: undefined,
    style: {},
    sourceHandleId: null,
    targetHandleId: null,
    interactionWidth: 20,
    markerStart: undefined,
    markerEnd: undefined,
    ...overrides,
  };
  return render(
    <ReactFlowProvider>
      <svg data-testid="svg-root">
        <LivingInkEdge {...props} />
      </svg>
    </ReactFlowProvider>,
  );
};

describe('LivingInkEdge', () => {
  beforeEach(() => {
    useExecutionLiveStore.getState().reset();
    // The animated flow only shows in the Result view.
    useEditorStore.setState({ ...initialEditorState, viewMode: 'result' });
  });

  describe('rendering', () => {
    it('should render an SVG path between two points', () => {
      const { container } = renderEdge({
        sourceX: 10,
        sourceY: 20,
        targetX: 240,
        targetY: 260,
      });

      const path = container.querySelector('path.react-flow__edge-path');
      expect(path).not.toBeNull();

      const d = path?.getAttribute('d') ?? '';
      expect(d.length).toBeGreaterThan(0);
    });
  });

  describe('bezier path (getBezierPath)', () => {
    it('should compute a cubic bezier path (starts with M, contains C)', () => {
      const { container } = renderEdge();
      const d = container.querySelector('path.react-flow__edge-path')?.getAttribute('d') ?? '';
      expect(d.startsWith('M')).toBe(true);
      expect(d).toMatch(/C/);
    });
  });

  describe('teal gradient stroke', () => {
    it('should define a linearGradient with teal stops (#00D4B3 → #00E8C4) and apply it', () => {
      const { container } = renderEdge();

      const gradient = container.querySelector('linearGradient#livingInkGradient');
      expect(gradient).not.toBeNull();

      const stops = gradient?.querySelectorAll('stop') ?? [];
      const colors = Array.from(stops).map((s) =>
        (s.getAttribute('stop-color') ?? '').toUpperCase(),
      );
      expect(colors).toContain('#00D4B3');
      expect(colors).toContain('#00E8C4');

      const path = container.querySelector('path.react-flow__edge-path');
      expect(path?.getAttribute('stroke')).toBe('url(#livingInkGradient)');
    });
  });

  describe('animated dash effect', () => {
    it('should apply the living-ink animation class when source=success and target=running', () => {
      seedActiveSegment('node-a', 'node-b');
      const { container } = renderEdge();
      const path = container.querySelector('path.react-flow__edge-path');

      const className = path?.getAttribute('class') ?? '';
      expect(className).toContain('animate-living-ink');

      const dash = path?.getAttribute('stroke-dasharray') ?? '';
      expect(dash.length).toBeGreaterThan(0);
    });
  });

  describe('store-driven activation', () => {
    it('should be inactive by default with no live state', () => {
      const { container } = renderEdge();
      const path = container.querySelector('path.react-flow__edge-path');
      expect(path).toHaveAttribute('data-active', 'false');
      expect(path?.getAttribute('class') ?? '').not.toContain('animate-living-ink');
    });

    it('should be active when source is success and target is running', () => {
      seedActiveSegment('node-a', 'node-b');
      const { container } = renderEdge();
      const path = container.querySelector('path.react-flow__edge-path');
      expect(path).toHaveAttribute('data-active', 'true');
    });

    it('should be inactive in configure view even when source=success and target=running', () => {
      seedActiveSegment('node-a', 'node-b');
      useEditorStore.setState({ viewMode: 'configure' });
      const { container } = renderEdge();
      expect(container.querySelector('path.react-flow__edge-path')).toHaveAttribute(
        'data-active',
        'false',
      );
    });

    it('should be inactive when source is still running (not yet success)', () => {
      useExecutionLiveStore.setState({
        nodes: new Map([
          ['node-a', baseRunState({ status: 'running' })],
          ['node-b', baseRunState({ status: 'running' })],
        ]),
      });
      const { container } = renderEdge();
      expect(container.querySelector('path.react-flow__edge-path')).toHaveAttribute(
        'data-active',
        'false',
      );
    });

    it('should be inactive when target has already completed', () => {
      useExecutionLiveStore.setState({
        nodes: new Map([
          ['node-a', baseRunState({ status: 'success' })],
          ['node-b', baseRunState({ status: 'success' })],
        ]),
      });
      const { container } = renderEdge();
      expect(container.querySelector('path.react-flow__edge-path')).toHaveAttribute(
        'data-active',
        'false',
      );
    });
  });

  describe('glow effect', () => {
    it('should define a Gaussian-blur filter and apply it to the edge path', () => {
      const { container } = renderEdge();

      const filter = container.querySelector('filter#livingInkGlow');
      expect(filter).not.toBeNull();
      expect(filter?.querySelector('feGaussianBlur')).not.toBeNull();

      const path = container.querySelector('path.react-flow__edge-path');
      expect(path?.getAttribute('filter')).toBe('url(#livingInkGlow)');
    });
  });

  describe('error variant (kind=error)', () => {
    it('should use the red error gradient and red stroke when data.kind is "error"', () => {
      const { container } = renderEdge({ data: { kind: 'error' } });

      const errorGradient = container.querySelector('linearGradient#livingInkErrorGradient');
      expect(errorGradient).not.toBeNull();

      const colors = Array.from(errorGradient?.querySelectorAll('stop') ?? []).map((s) =>
        (s.getAttribute('stop-color') ?? '').toUpperCase(),
      );
      expect(colors.some((c) => c.startsWith('#'))).toBe(true);

      const path = container.querySelector('path.react-flow__edge-path');
      expect(path?.getAttribute('stroke')).toBe('url(#livingInkErrorGradient)');
      expect(path).toHaveAttribute('data-kind', 'error');
    });

    it('should keep the teal gradient when data.kind is missing or "success"', () => {
      const { container } = renderEdge({ data: { kind: 'success' } });
      const path = container.querySelector('path.react-flow__edge-path');
      expect(path?.getAttribute('stroke')).toBe('url(#livingInkGradient)');
      expect(path).toHaveAttribute('data-kind', 'success');
    });

    it('should still render a dashed stroke for error edges', () => {
      const { container } = renderEdge({ data: { kind: 'error' } });
      const path = container.querySelector('path.react-flow__edge-path');
      const dash = path?.getAttribute('stroke-dasharray') ?? '';
      expect(dash.length).toBeGreaterThan(0);
    });
  });

  describe('memoization', () => {
    it('should be wrapped in React.memo with a displayName of "LivingInkEdge"', () => {
      const memoSymbol = Symbol.for('react.memo');
      expect((LivingInkEdge as unknown as { $$typeof: symbol }).$$typeof).toBe(memoSymbol);
      expect((LivingInkEdge as unknown as { displayName?: string }).displayName).toBe(
        'LivingInkEdge',
      );
    });
  });
});
