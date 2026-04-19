import type { WorkflowDefinition } from '@tietide/shared';
import { topologicalSort, CircularDependencyError } from './topological-sort';

const node = (id: string, type = 'stub', name = id) => ({
  id,
  type,
  name,
  position: { x: 0, y: 0 },
  config: {},
});

const edge = (id: string, source: string, target: string, sourceHandle?: string) => ({
  id,
  source,
  target,
  ...(sourceHandle ? { sourceHandle } : {}),
});

describe('topologicalSort', () => {
  describe('valid DAGs', () => {
    it('should return single node id when workflow has one trigger node', () => {
      const def: WorkflowDefinition = {
        nodes: [node('trigger')],
        edges: [],
      };
      expect(topologicalSort(def)).toEqual(['trigger']);
    });

    it('should return nodes in dependency order for linear A->B->C', () => {
      const def: WorkflowDefinition = {
        nodes: [node('C'), node('A'), node('B')],
        edges: [edge('e1', 'A', 'B'), edge('e2', 'B', 'C')],
      };
      expect(topologicalSort(def)).toEqual(['A', 'B', 'C']);
    });

    it('should produce a valid linearization for an IF node with true/false branches', () => {
      const def: WorkflowDefinition = {
        nodes: [node('trigger'), node('if'), node('truePath'), node('falsePath')],
        edges: [
          edge('e1', 'trigger', 'if'),
          edge('e2', 'if', 'truePath', 'true'),
          edge('e3', 'if', 'falsePath', 'false'),
        ],
      };
      const order = topologicalSort(def);
      expect(order).toHaveLength(4);
      expect(order.indexOf('trigger')).toBeLessThan(order.indexOf('if'));
      expect(order.indexOf('if')).toBeLessThan(order.indexOf('truePath'));
      expect(order.indexOf('if')).toBeLessThan(order.indexOf('falsePath'));
    });

    it('should order a diamond A->B, A->C, B->D, C->D without error', () => {
      const def: WorkflowDefinition = {
        nodes: [node('A'), node('B'), node('C'), node('D')],
        edges: [
          edge('e1', 'A', 'B'),
          edge('e2', 'A', 'C'),
          edge('e3', 'B', 'D'),
          edge('e4', 'C', 'D'),
        ],
      };
      const order = topologicalSort(def);
      expect(order[0]).toBe('A');
      expect(order[3]).toBe('D');
      expect(new Set(order)).toEqual(new Set(['A', 'B', 'C', 'D']));
    });
  });

  describe('cycle detection', () => {
    it('should throw CircularDependencyError when A->B->A', () => {
      const def: WorkflowDefinition = {
        nodes: [node('A'), node('B')],
        edges: [edge('e1', 'A', 'B'), edge('e2', 'B', 'A')],
      };
      expect(() => topologicalSort(def)).toThrow(CircularDependencyError);
    });

    it('should include the cycle members in the thrown error', () => {
      const def: WorkflowDefinition = {
        nodes: [node('A'), node('B'), node('C')],
        edges: [edge('e1', 'A', 'B'), edge('e2', 'B', 'C'), edge('e3', 'C', 'A')],
      };
      try {
        topologicalSort(def);
        fail('expected CircularDependencyError');
      } catch (err) {
        expect(err).toBeInstanceOf(CircularDependencyError);
        expect((err as CircularDependencyError).cycle.sort()).toEqual(['A', 'B', 'C']);
      }
    });
  });

  describe('validation errors', () => {
    it('should throw when workflow has zero nodes', () => {
      const def: WorkflowDefinition = { nodes: [], edges: [] };
      expect(() => topologicalSort(def)).toThrow(/at least one node/i);
    });

    it('should throw when workflow has multiple in-degree-zero nodes (MVP constraint)', () => {
      const def: WorkflowDefinition = {
        nodes: [node('triggerA'), node('triggerB'), node('action')],
        edges: [edge('e1', 'triggerA', 'action'), edge('e2', 'triggerB', 'action')],
      };
      expect(() => topologicalSort(def)).toThrow(/exactly one trigger/i);
    });

    it('should throw when an edge references an unknown node id', () => {
      const def: WorkflowDefinition = {
        nodes: [node('A'), node('B')],
        edges: [edge('e1', 'A', 'ghost')],
      };
      expect(() => topologicalSort(def)).toThrow(/unknown node/i);
    });
  });
});
