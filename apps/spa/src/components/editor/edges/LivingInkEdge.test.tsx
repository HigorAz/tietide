import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider, Position, type EdgeProps } from 'reactflow';
import { LivingInkEdge } from './LivingInkEdge';

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
    it('should apply the living-ink animation class and a non-empty stroke-dasharray', () => {
      const { container } = renderEdge();
      const path = container.querySelector('path.react-flow__edge-path');

      const className = path?.getAttribute('class') ?? '';
      expect(className).toContain('animate-living-ink');

      const dash = path?.getAttribute('stroke-dasharray') ?? '';
      expect(dash.length).toBeGreaterThan(0);
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
