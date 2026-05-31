import type { WorkflowDefinition } from '@tietide/shared';
import { buildSingleNodeDefinition } from './single-node-subgraph';

const node = (id: string, type = 'http-request') => ({
  id,
  type,
  name: id,
  position: { x: 0, y: 0 },
  config: {},
});
const edge = (id: string, source: string, target: string) => ({ id, source, target });

describe('buildSingleNodeDefinition', () => {
  it('includes the target plus its transitive ancestors and only internal edges', () => {
    const def: WorkflowDefinition = {
      nodes: [node('T', 'manual-trigger'), node('A'), node('B'), node('C'), node('X')],
      edges: [
        edge('e1', 'T', 'A'),
        edge('e2', 'A', 'B'),
        edge('e3', 'B', 'C'),
        edge('e4', 'C', 'X'), // downstream of target — must be excluded
      ],
    };

    const sub = buildSingleNodeDefinition(def, 'C');

    expect(sub.nodes.map((n) => n.id).sort()).toEqual(['A', 'B', 'C', 'T']);
    expect(sub.edges.map((e) => e.id).sort()).toEqual(['e1', 'e2', 'e3']);
  });

  it('returns just the target when it has no ancestors', () => {
    const def: WorkflowDefinition = {
      nodes: [node('A'), node('B')],
      edges: [edge('e1', 'A', 'B')],
    };

    const sub = buildSingleNodeDefinition(def, 'A');

    expect(sub.nodes.map((n) => n.id)).toEqual(['A']);
    expect(sub.edges).toEqual([]);
  });

  it('is cycle-safe', () => {
    const def: WorkflowDefinition = {
      nodes: [node('A'), node('B')],
      edges: [edge('e1', 'A', 'B'), edge('e2', 'B', 'A')],
    };

    const sub = buildSingleNodeDefinition(def, 'B');

    expect(sub.nodes.map((n) => n.id).sort()).toEqual(['A', 'B']);
  });

  it('throws when the target node is not in the definition', () => {
    const def: WorkflowDefinition = { nodes: [node('A')], edges: [] };
    expect(() => buildSingleNodeDefinition(def, 'missing')).toThrow();
  });
});
