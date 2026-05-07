import type { WorkflowDefinition } from '@tietide/shared';
import {
  CrossBoundaryEdgeError,
  buildBodyDefinition,
  extractBodySubgraph,
  validateBodySubgraph,
} from './iterator-runner';

const node = (id: string, type = 'stub', name = id) => ({
  id,
  type,
  name,
  position: { x: 0, y: 0 },
  config: {},
});

const edge = (
  id: string,
  source: string,
  target: string,
  sourceHandle?: string,
  kind?: 'success' | 'error',
) => ({
  id,
  source,
  target,
  ...(sourceHandle ? { sourceHandle } : {}),
  ...(kind ? { kind } : {}),
});

describe('extractBodySubgraph', () => {
  it('should return body containing all nodes reachable from iterator body handle in a linear chain', () => {
    // trigger -> iter -[body]-> A -> B -> C
    const def: WorkflowDefinition = {
      nodes: [node('trigger'), node('iter', 'iterator'), node('A'), node('B'), node('C')],
      edges: [
        edge('e1', 'trigger', 'iter'),
        edge('e2', 'iter', 'A', 'body'),
        edge('e3', 'A', 'B'),
        edge('e4', 'B', 'C'),
      ],
    };

    const result = extractBodySubgraph(def, 'iter');

    expect(result.bodyEntryNodeIds).toEqual(['A']);
    expect(result.bodyNodeIds).toEqual(new Set(['A', 'B', 'C']));
    expect(result.bodyEdges.map((e) => e.id).sort()).toEqual(['e3', 'e4']);
  });

  it('should include nodes on diverging branches inside the body', () => {
    // iter -[body]-> A -> {B, C}
    const def: WorkflowDefinition = {
      nodes: [node('iter', 'iterator'), node('A'), node('B'), node('C')],
      edges: [edge('e1', 'iter', 'A', 'body'), edge('e2', 'A', 'B'), edge('e3', 'A', 'C')],
    };

    const result = extractBodySubgraph(def, 'iter');

    expect(result.bodyNodeIds).toEqual(new Set(['A', 'B', 'C']));
  });

  it('should exclude nodes wired only via the done handle', () => {
    // iter -[body]-> A -> B  ;  iter -[done]-> X
    const def: WorkflowDefinition = {
      nodes: [node('iter', 'iterator'), node('A'), node('B'), node('X')],
      edges: [
        edge('e1', 'iter', 'A', 'body'),
        edge('e2', 'A', 'B'),
        edge('e3', 'iter', 'X', 'done'),
      ],
    };

    const result = extractBodySubgraph(def, 'iter');

    expect(result.bodyNodeIds).toEqual(new Set(['A', 'B']));
    expect(result.bodyNodeIds.has('X')).toBe(false);
  });

  it('should return empty sets when the iterator has no body edges', () => {
    const def: WorkflowDefinition = {
      nodes: [node('iter', 'iterator'), node('X')],
      edges: [edge('e1', 'iter', 'X', 'done')],
    };

    const result = extractBodySubgraph(def, 'iter');

    expect(result.bodyEntryNodeIds).toEqual([]);
    expect(result.bodyNodeIds.size).toBe(0);
    expect(result.bodyEdges).toEqual([]);
  });

  it('should support multiple body entry edges from the iterator', () => {
    // iter -[body]-> A  ;  iter -[body]-> B
    const def: WorkflowDefinition = {
      nodes: [node('iter', 'iterator'), node('A'), node('B')],
      edges: [edge('e1', 'iter', 'A', 'body'), edge('e2', 'iter', 'B', 'body')],
    };

    const result = extractBodySubgraph(def, 'iter');

    expect(result.bodyEntryNodeIds.sort()).toEqual(['A', 'B']);
    expect(result.bodyNodeIds).toEqual(new Set(['A', 'B']));
  });
});

describe('validateBodySubgraph', () => {
  it('should pass when every body node is entered only via the iterator body handle', () => {
    const def: WorkflowDefinition = {
      nodes: [node('iter', 'iterator'), node('A'), node('B')],
      edges: [edge('e1', 'iter', 'A', 'body'), edge('e2', 'A', 'B')],
    };
    const bodyNodeIds = new Set(['A', 'B']);

    expect(() => validateBodySubgraph(def, 'iter', bodyNodeIds)).not.toThrow();
  });

  it('should throw CrossBoundaryEdgeError when a body node has an incoming edge from outside the body', () => {
    // iter -[body]-> A -> B  ;  X -> B  (X is outside the body)
    const def: WorkflowDefinition = {
      nodes: [node('iter', 'iterator'), node('A'), node('B'), node('X')],
      edges: [edge('e1', 'iter', 'A', 'body'), edge('e2', 'A', 'B'), edge('e3', 'X', 'B')],
    };
    const bodyNodeIds = new Set(['A', 'B']);

    expect(() => validateBodySubgraph(def, 'iter', bodyNodeIds)).toThrow(CrossBoundaryEdgeError);
  });

  it('should ignore the iterator body-handle edges (they are the legitimate entry)', () => {
    const def: WorkflowDefinition = {
      nodes: [node('iter', 'iterator'), node('A')],
      edges: [edge('e1', 'iter', 'A', 'body')],
    };
    const bodyNodeIds = new Set(['A']);

    expect(() => validateBodySubgraph(def, 'iter', bodyNodeIds)).not.toThrow();
  });

  it('should reject a non-body source pointing into the body even on the body handle from a different node', () => {
    // X (not iterator) -[body]-> A — we treat handle string as semantic only when source is the iterator
    const def: WorkflowDefinition = {
      nodes: [node('iter', 'iterator'), node('X'), node('A')],
      edges: [edge('e1', 'iter', 'A', 'body'), edge('e2', 'X', 'A', 'body')],
    };
    const bodyNodeIds = new Set(['A']);

    expect(() => validateBodySubgraph(def, 'iter', bodyNodeIds)).toThrow(CrossBoundaryEdgeError);
  });
});

describe('buildBodyDefinition', () => {
  it('should synthesize a manual-trigger entry node connected to body-entry nodes', () => {
    const def: WorkflowDefinition = {
      nodes: [node('iter', 'iterator'), node('A'), node('B')],
      edges: [edge('e1', 'iter', 'A', 'body'), edge('e2', 'A', 'B')],
    };
    const bodyNodeIds = new Set(['A', 'B']);

    const built = buildBodyDefinition({
      definition: def,
      iteratorNodeId: 'iter',
      bodyNodeIds,
      bodyEntryNodeIds: ['A'],
      syntheticTriggerId: '__iter_trigger',
    });

    expect(built.nodes.map((n) => n.id)).toEqual(['__iter_trigger', 'A', 'B']);
    const trigger = built.nodes[0];
    expect(trigger.type).toBe('manual-trigger');
    expect(
      built.edges.find((e) => e.source === '__iter_trigger' && e.target === 'A'),
    ).toBeDefined();
    expect(built.edges.find((e) => e.source === 'A' && e.target === 'B')).toBeDefined();
  });

  it('should handle multiple body entry nodes by emitting one edge per entry', () => {
    const def: WorkflowDefinition = {
      nodes: [node('iter', 'iterator'), node('A'), node('B')],
      edges: [edge('e1', 'iter', 'A', 'body'), edge('e2', 'iter', 'B', 'body')],
    };
    const bodyNodeIds = new Set(['A', 'B']);

    const built = buildBodyDefinition({
      definition: def,
      iteratorNodeId: 'iter',
      bodyNodeIds,
      bodyEntryNodeIds: ['A', 'B'],
      syntheticTriggerId: '__iter_trigger',
    });

    const triggerEdges = built.edges.filter((e) => e.source === '__iter_trigger');
    expect(triggerEdges.map((e) => e.target).sort()).toEqual(['A', 'B']);
  });
});
