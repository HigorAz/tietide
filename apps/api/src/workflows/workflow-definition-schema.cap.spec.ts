import { workflowDefinitionSchema, MAX_WORKFLOW_NODES, MAX_WORKFLOW_EDGES } from '@tietide/shared';

function makeNode(i: number) {
  return {
    id: `n${i}`,
    type: 'manual-trigger',
    name: `Node ${i}`,
    position: { x: 0, y: 0 },
    config: {},
  };
}

function makeEdge(i: number) {
  return { id: `e${i}`, source: 'n0', target: `n${i}` };
}

describe('workflowDefinitionSchema element-count caps', () => {
  it('parses a definition at the node cap', () => {
    const nodes = Array.from({ length: MAX_WORKFLOW_NODES }, (_, i) => makeNode(i));
    const result = workflowDefinitionSchema.safeParse({ nodes, edges: [] });
    expect(result.success).toBe(true);
  });

  it('rejects a definition with more nodes than the cap', () => {
    const nodes = Array.from({ length: MAX_WORKFLOW_NODES + 1 }, (_, i) => makeNode(i));
    const result = workflowDefinitionSchema.safeParse({ nodes, edges: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((iss) => iss.path[0] === 'nodes')).toBe(true);
    }
  });

  it('parses a definition at the edge cap', () => {
    const edges = Array.from({ length: MAX_WORKFLOW_EDGES }, (_, i) => makeEdge(i + 1));
    const result = workflowDefinitionSchema.safeParse({ nodes: [], edges });
    expect(result.success).toBe(true);
  });

  it('rejects a definition with more edges than the cap', () => {
    const edges = Array.from({ length: MAX_WORKFLOW_EDGES + 1 }, (_, i) => makeEdge(i + 1));
    const result = workflowDefinitionSchema.safeParse({ nodes: [], edges });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((iss) => iss.path[0] === 'edges')).toBe(true);
    }
  });
});
