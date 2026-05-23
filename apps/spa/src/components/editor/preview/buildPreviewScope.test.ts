import { describe, it, expect } from 'vitest';
import type { Edge, Node } from 'reactflow';
import { NodeType } from '@tietide/shared';
import type { CustomNodeData } from '@/components/editor/nodes/CustomNode.types';
import type { NodeRunState } from '@/stores/executionLiveStore';
import { buildPreviewScope } from './buildPreviewScope';
import { NODE_OUTPUT_EXAMPLES } from './nodeOutputExamples';

const makeNode = (id: string, nodeType: string): Node<CustomNodeData> => ({
  id,
  type: 'custom',
  position: { x: 0, y: 0 },
  data: {
    label: id,
    description: '',
    nodeType: nodeType as NodeType,
    status: 'idle',
    config: {},
  },
});

const makeEdge = (source: string, target: string): Edge => ({
  id: `${source}->${target}`,
  source,
  target,
});

const makeRunState = (output: unknown): NodeRunState => ({
  status: 'success',
  nodeType: null,
  startedAt: '2026-05-23T12:00:00.000Z',
  finishedAt: '2026-05-23T12:00:01.000Z',
  durationMs: 1000,
  input: null,
  output,
  error: null,
});

describe('buildPreviewScope', () => {
  it('should return an empty object when the selected node has no ancestors', () => {
    const nodes = [makeNode('a', NodeType.MANUAL_TRIGGER)];
    const edges: Edge[] = [];
    const live = new Map<string, NodeRunState>();

    const scope = buildPreviewScope('a', nodes, edges, live);

    expect(scope).toEqual({});
  });

  it('should use live output when an ancestor has executed', () => {
    const nodes = [
      makeNode('trigger', NodeType.MANUAL_TRIGGER),
      makeNode('http', NodeType.HTTP_REQUEST),
    ];
    const edges = [makeEdge('trigger', 'http')];
    const live = new Map<string, NodeRunState>();
    const liveOutput = { triggeredBy: 'live@example.com' };
    live.set('trigger', makeRunState(liveOutput));

    const scope = buildPreviewScope('http', nodes, edges, live);

    expect(scope).toEqual({ trigger: liveOutput });
  });

  it('should fall back to the curated example when an ancestor has no live output', () => {
    const nodes = [
      makeNode('trigger', NodeType.MANUAL_TRIGGER),
      makeNode('http', NodeType.HTTP_REQUEST),
    ];
    const edges = [makeEdge('trigger', 'http')];
    const live = new Map<string, NodeRunState>();

    const scope = buildPreviewScope('http', nodes, edges, live);

    expect(scope).toEqual({ trigger: NODE_OUTPUT_EXAMPLES['manual-trigger'] });
  });

  it('should omit ancestors with neither live output nor an example payload', () => {
    const nodes = [
      makeNode('weird', 'no-example-known' as NodeType),
      makeNode('http', NodeType.HTTP_REQUEST),
    ];
    const edges = [makeEdge('weird', 'http')];
    const live = new Map<string, NodeRunState>();

    const scope = buildPreviewScope('http', nodes, edges, live);

    expect(scope).toEqual({});
  });

  it('should walk multi-hop ancestors (A -> B -> C, scope from C sees both A and B)', () => {
    const nodes = [
      makeNode('a', NodeType.MANUAL_TRIGGER),
      makeNode('b', NodeType.HTTP_REQUEST),
      makeNode('c', NodeType.GMAIL_SEND),
    ];
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')];
    const live = new Map<string, NodeRunState>();
    live.set('b', makeRunState({ statusCode: 201, body: { id: 42 } }));

    const scope = buildPreviewScope('c', nodes, edges, live);

    expect(scope).toHaveProperty('a');
    expect(scope).toHaveProperty('b');
    expect(scope.b).toEqual({ statusCode: 201, body: { id: 42 } });
    expect(scope.a).toEqual(NODE_OUTPUT_EXAMPLES['manual-trigger']);
  });

  it('should not loop on cyclic edges (defensive)', () => {
    const nodes = [makeNode('a', NodeType.MANUAL_TRIGGER), makeNode('b', NodeType.HTTP_REQUEST)];
    // a -> b and b -> a — a cycle. bfsAncestors must terminate.
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'a')];
    const live = new Map<string, NodeRunState>();

    const scope = buildPreviewScope('b', nodes, edges, live);

    // a should appear once; bfsAncestors marks the start node visited so b is excluded.
    expect(Object.keys(scope)).toEqual(['a']);
  });

  it('should prefer live output over the example when both exist', () => {
    const nodes = [
      makeNode('trigger', NodeType.WEBHOOK_TRIGGER),
      makeNode('http', NodeType.HTTP_REQUEST),
    ];
    const edges = [makeEdge('trigger', 'http')];
    const live = new Map<string, NodeRunState>();
    live.set('trigger', makeRunState({ method: 'PUT', body: { live: true } }));

    const scope = buildPreviewScope('http', nodes, edges, live);

    expect(scope.trigger).toEqual({ method: 'PUT', body: { live: true } });
  });
});
