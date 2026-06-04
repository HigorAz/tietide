import { describe, it, expect } from 'vitest';
import { buildFlowNodes, wavePath, FLOW_SEQ, type FlowGeo } from './authFlowGeometry';

const geo: FlowGeo = { w: 1200, h: 600, x0: 300, x3: 800 };

describe('authFlowGeometry', () => {
  describe('buildFlowNodes', () => {
    it('places one node per pipeline step, anchored at x0 and x3', () => {
      const nodes = buildFlowNodes(geo);
      expect(nodes).toHaveLength(FLOW_SEQ.length);
      expect(nodes[0].x).toBeCloseTo(geo.x0);
      expect(nodes[nodes.length - 1].x).toBeCloseTo(geo.x3);
      expect(nodes.map((n) => n.icon)).toEqual([...FLOW_SEQ]);
    });

    it('rises from bottom-left to top-right with a vertically-centred span', () => {
      const nodes = buildFlowNodes(geo);
      expect(nodes[0].y).toBeGreaterThan(nodes[nodes.length - 1].y); // first lower than last
      const mid = (nodes[0].y + nodes[nodes.length - 1].y) / 2;
      expect(mid).toBeCloseTo(geo.h / 2); // symmetric → equal top/bottom
    });
  });

  describe('wavePath', () => {
    it('returns an empty string for fewer than two points', () => {
      expect(wavePath([{ x: 0, y: 0 }], 20, 3)).toBe('');
    });

    it('starts the path exactly at the first node', () => {
      const nodes = buildFlowNodes(geo);
      const d = wavePath(nodes, 24, 6);
      expect(d.startsWith('M')).toBe(true);
      const [mx, my] = d.slice(1).split(' L ')[0].split(' ').map(Number);
      expect(mx).toBeCloseTo(nodes[0].x, 0);
      expect(my).toBeCloseTo(nodes[0].y, 0);
    });
  });
});
