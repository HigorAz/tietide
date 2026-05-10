import type { WorkflowDefinition } from '@tietide/shared';
import { validateWorkflowTopology } from '@tietide/shared';

const node = (id: string, type = 'stub', name = id) => ({
  id,
  type,
  name,
  position: { x: 0, y: 0 },
  config: {},
});

const edge = (id: string, source: string, target: string) => ({ id, source, target });

describe('validateWorkflowTopology', () => {
  describe('valid graphs', () => {
    it('returns no issues for a single trigger node with no edges', () => {
      const def: WorkflowDefinition = { nodes: [node('trigger')], edges: [] };
      expect(validateWorkflowTopology(def)).toEqual([]);
    });

    it('returns no issues for a linear A->B->C chain with one root', () => {
      const def: WorkflowDefinition = {
        nodes: [node('A'), node('B'), node('C')],
        edges: [edge('e1', 'A', 'B'), edge('e2', 'B', 'C')],
      };
      expect(validateWorkflowTopology(def)).toEqual([]);
    });

    it('returns no issues for a diamond A->B, A->C, B->D, C->D', () => {
      const def: WorkflowDefinition = {
        nodes: [node('A'), node('B'), node('C'), node('D')],
        edges: [
          edge('e1', 'A', 'B'),
          edge('e2', 'A', 'C'),
          edge('e3', 'B', 'D'),
          edge('e4', 'C', 'D'),
        ],
      };
      expect(validateWorkflowTopology(def)).toEqual([]);
    });
  });

  describe('no trigger (zero in-degree-0 nodes)', () => {
    it('flags a self-loop A->A as a cycle with no trigger', () => {
      const def: WorkflowDefinition = {
        nodes: [node('A')],
        edges: [edge('e1', 'A', 'A')],
      };
      const issues = validateWorkflowTopology(def);
      // Either no_trigger or cycle is acceptable here — a self-loop is both.
      // We assert at least one issue exists and that the workflow is rejected.
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.some((i) => i.code === 'no_trigger' || i.code === 'cycle')).toBe(true);
    });

    it('flags a two-node cycle A<->B with no trigger', () => {
      const def: WorkflowDefinition = {
        nodes: [node('A'), node('B')],
        edges: [edge('e1', 'A', 'B'), edge('e2', 'B', 'A')],
      };
      const issues = validateWorkflowTopology(def);
      // Every node has an incoming edge → no_trigger; also a cycle.
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].code === 'no_trigger' || issues[0].code === 'cycle').toBe(true);
    });
  });

  describe('multiple triggers', () => {
    it('flags two disconnected trigger nodes feeding the same action', () => {
      const def: WorkflowDefinition = {
        nodes: [node('triggerA'), node('triggerB'), node('action')],
        edges: [edge('e1', 'triggerA', 'action'), edge('e2', 'triggerB', 'action')],
      };
      const issues = validateWorkflowTopology(def);
      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('multiple_triggers');
      expect(issues[0].message).toMatch(/exactly one trigger/i);
      expect(issues[0].path).toEqual(['nodes']);
    });
  });

  describe('dangling edges', () => {
    it('flags an edge whose target references an unknown node', () => {
      const def: WorkflowDefinition = {
        nodes: [node('A'), node('B')],
        edges: [edge('e1', 'A', 'ghost')],
      };
      const issues = validateWorkflowTopology(def);
      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('dangling_edge');
      expect(issues[0].message).toMatch(/unknown node/i);
      expect(issues[0].path).toEqual(['edges', 0, 'target']);
    });

    it('flags an edge whose source references an unknown node', () => {
      const def: WorkflowDefinition = {
        nodes: [node('A'), node('B')],
        edges: [edge('e1', 'ghost', 'B')],
      };
      const issues = validateWorkflowTopology(def);
      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('dangling_edge');
      expect(issues[0].path).toEqual(['edges', 0, 'source']);
    });
  });

  describe('cycles', () => {
    it('flags a three-node cycle A->B->C->A', () => {
      const def: WorkflowDefinition = {
        nodes: [node('trigger'), node('A'), node('B'), node('C')],
        edges: [
          edge('e0', 'trigger', 'A'),
          edge('e1', 'A', 'B'),
          edge('e2', 'B', 'C'),
          edge('e3', 'C', 'A'),
        ],
      };
      const issues = validateWorkflowTopology(def);
      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('cycle');
      expect(issues[0].message).toMatch(/circular/i);
      // Cycle members should appear in the issue's data path.
      expect(issues[0].path[0]).toBe('nodes');
    });
  });

  describe('empty workflow', () => {
    it('flags zero nodes', () => {
      const def: WorkflowDefinition = { nodes: [], edges: [] };
      const issues = validateWorkflowTopology(def);
      expect(issues).toHaveLength(1);
      expect(issues[0].code).toBe('no_trigger');
      expect(issues[0].message).toMatch(/at least one node/i);
    });
  });
});
