import { describe, it, expect } from 'vitest';
import type { Edge, Node } from 'reactflow';
import { z } from 'zod';
import { NodeType, NodeCategory, NODE_CATALOG, getNodeOutputSchema } from '@tietide/shared';
import type { CustomNodeData } from '@/components/editor/nodes/CustomNode.types';
import { getUpstreamSchemas, walkSchema } from './upstream-schema';

const mkNode = (id: string, nodeType: NodeType, label = id): Node<CustomNodeData> => ({
  id,
  type: 'custom',
  position: { x: 0, y: 0 },
  data: { label, nodeType },
});

const mkEdge = (source: string, target: string): Edge => ({
  id: `${source}->${target}`,
  source,
  target,
});

describe('getUpstreamSchemas', () => {
  it('returns no ancestors when the target has no incoming edges', () => {
    const nodes = [mkNode('http', NodeType.HTTP_REQUEST)];
    const edges: Edge[] = [];
    const result = getUpstreamSchemas('http', nodes, edges);
    expect(result.suggestions).toEqual([]);
    expect(Object.keys(result.byNode)).toEqual([]);
  });

  it('lists upstream nodes from a linear A->B->C chain when called for C', () => {
    const nodes = [
      mkNode('A', NodeType.WEBHOOK_TRIGGER),
      mkNode('B', NodeType.HTTP_REQUEST),
      mkNode('C', NodeType.HTTP_REQUEST),
    ];
    const edges = [mkEdge('A', 'B'), mkEdge('B', 'C')];
    const result = getUpstreamSchemas('C', nodes, edges);
    const upstreamIds = new Set(result.suggestions.map((s) => s.nodeId));
    expect(upstreamIds).toEqual(new Set(['A', 'B']));
  });

  it('orders suggestions by BFS distance — closest predecessors first', () => {
    const nodes = [
      mkNode('A', NodeType.WEBHOOK_TRIGGER),
      mkNode('B', NodeType.HTTP_REQUEST),
      mkNode('C', NodeType.HTTP_REQUEST),
    ];
    const edges = [mkEdge('A', 'B'), mkEdge('B', 'C')];
    const result = getUpstreamSchemas('C', nodes, edges);
    const firstId = result.suggestions[0]?.nodeId;
    const lastId = result.suggestions[result.suggestions.length - 1]?.nodeId;
    expect(firstId).toBe('B');
    expect(lastId).toBe('A');
  });

  it('lists all ancestors of a diamond A->B,A->C,B->D,C->D when called for D', () => {
    const nodes = [
      mkNode('A', NodeType.WEBHOOK_TRIGGER),
      mkNode('B', NodeType.HTTP_REQUEST),
      mkNode('C', NodeType.HTTP_REQUEST),
      mkNode('D', NodeType.HTTP_REQUEST),
    ];
    const edges = [mkEdge('A', 'B'), mkEdge('A', 'C'), mkEdge('B', 'D'), mkEdge('C', 'D')];
    const result = getUpstreamSchemas('D', nodes, edges);
    const upstreamIds = new Set(result.suggestions.map((s) => s.nodeId));
    expect(upstreamIds).toEqual(new Set(['A', 'B', 'C']));
  });

  it('omits nodes whose type has no registered output schema (no throw)', () => {
    const nodes = [
      mkNode('U', 'unregistered-type' as NodeType),
      mkNode('http', NodeType.HTTP_REQUEST),
    ];
    const edges = [mkEdge('U', 'http')];
    const result = getUpstreamSchemas('http', nodes, edges);
    expect(result.suggestions).toEqual([]);
    expect(result.byNode).toEqual({});
  });

  it('expands httpRequestOutputSchema into nested paths for autocomplete', () => {
    const nodes = [mkNode('http1', NodeType.HTTP_REQUEST), mkNode('http2', NodeType.HTTP_REQUEST)];
    const edges = [mkEdge('http1', 'http2')];
    const result = getUpstreamSchemas('http2', nodes, edges);
    const paths = result.suggestions.map((s) => s.path);
    expect(paths).toContain('statusCode');
    expect(paths).toContain('headers');
    expect(paths).toContain('body');
    expect(paths).toContain('duration');
  });

  it('emits a single root entry for a record/passthrough schema (e.g., webhook trigger)', () => {
    const nodes = [mkNode('wh', NodeType.WEBHOOK_TRIGGER), mkNode('http', NodeType.HTTP_REQUEST)];
    const edges = [mkEdge('wh', 'http')];
    const result = getUpstreamSchemas('http', nodes, edges);
    const whSuggestions = result.suggestions.filter((s) => s.nodeId === 'wh');
    expect(whSuggestions.length).toBeGreaterThan(0);
  });

  it('does not include the target node itself in suggestions', () => {
    const nodes = [mkNode('A', NodeType.WEBHOOK_TRIGGER), mkNode('B', NodeType.HTTP_REQUEST)];
    const edges = [mkEdge('A', 'B')];
    const result = getUpstreamSchemas('B', nodes, edges);
    expect(result.suggestions.some((s) => s.nodeId === 'B')).toBe(false);
  });

  // The data-pill picker was empty for ~168 node types because only 11 had a
  // registered output schema. With the generic fallback, every *catalog* node
  // type now contributes at least a whole-output pill.
  it('yields at least one suggestion for an upstream catalog node lacking a concrete schema', () => {
    const nodes = [mkNode('s', NodeType.SLACK_POST_MESSAGE), mkNode('http', NodeType.HTTP_REQUEST)];
    const edges = [mkEdge('s', 'http')];
    const result = getUpstreamSchemas('http', nodes, edges);
    expect(result.suggestions.some((x) => x.nodeId === 's')).toBe(true);
  });

  it('exposes concrete fields for a trigger upstream (gmail-message-received)', () => {
    const nodes = [
      mkNode('g', NodeType.GMAIL_MESSAGE_RECEIVED),
      mkNode('http', NodeType.HTTP_REQUEST),
    ];
    const edges = [mkEdge('g', 'http')];
    const result = getUpstreamSchemas('http', nodes, edges);
    const paths = result.suggestions.filter((s) => s.nodeId === 'g').map((s) => s.path);
    expect(paths).toContain('subject');
    expect(paths).toContain('from');
  });

  it('exposes concrete fields for a Discord trigger upstream (the reported bug)', () => {
    const nodes = [
      mkNode('d', NodeType.DISCORD_MESSAGE_RECEIVED),
      mkNode('gmail', NodeType.GMAIL_SEARCH),
    ];
    const edges = [mkEdge('d', 'gmail')];
    const result = getUpstreamSchemas('gmail', nodes, edges);
    expect(result.suggestions.some((s) => s.nodeId === 'd')).toBe(true);
  });
});

describe('getNodeOutputSchema — coverage', () => {
  it('returns an output schema for every non-annotation catalog node type', () => {
    const missing = NODE_CATALOG.filter((d) => d.category !== NodeCategory.ANNOTATION)
      .filter((d) => !getNodeOutputSchema(d.type))
      .map((d) => d.type);
    expect(missing).toEqual([]);
  });

  it('returns undefined for a type that is not in the catalog', () => {
    expect(getNodeOutputSchema('totally-unknown-type' as NodeType)).toBeUndefined();
  });

  it('returns concrete (field-bearing) schemas for high-value triggers', () => {
    const highValue = [
      NodeType.GMAIL_MESSAGE_RECEIVED,
      NodeType.SLACK_MESSAGE_RECEIVED,
      NodeType.DISCORD_MESSAGE_RECEIVED,
      NodeType.TELEGRAM_MESSAGE_RECEIVED,
      NodeType.TWILIO_SMS_RECEIVED,
      NodeType.STRIPE_EVENT_RECEIVED,
    ];
    for (const type of highValue) {
      const schema = getNodeOutputSchema(type);
      expect(schema, type).toBeDefined();
      const paths = walkSchema(schema as z.ZodTypeAny).map((p) => p.path);
      expect(
        paths.some((p) => p.length > 0),
        type,
      ).toBe(true);
    }
  });
});

describe('walkSchema', () => {
  it('emits primitive paths for a flat object schema', () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const paths = walkSchema(schema).map((p) => p.path);
    expect(paths.sort()).toEqual(['age', 'name']);
  });

  it('emits nested paths for nested objects', () => {
    const schema = z.object({ user: z.object({ email: z.string() }) });
    const paths = walkSchema(schema).map((p) => p.path);
    expect(paths).toContain('user.email');
  });

  it('unwraps optional and nullable wrappers', () => {
    const schema = z.object({ name: z.string().optional(), age: z.number().nullable() });
    const paths = walkSchema(schema).map((p) => p.path);
    expect(paths.sort()).toEqual(['age', 'name']);
  });

  it('emits an array index sample for arrays', () => {
    const schema = z.object({ items: z.array(z.object({ id: z.string() })) });
    const paths = walkSchema(schema).map((p) => p.path);
    expect(paths.some((p) => p === 'items.0.id' || p === 'items.0')).toBe(true);
  });

  it('emits a single root entry when given a record/passthrough schema', () => {
    const schema = z.record(z.unknown());
    const paths = walkSchema(schema);
    expect(paths.length).toBeGreaterThanOrEqual(1);
  });

  it('caps recursion depth defensively for cycles', () => {
    type RecSchema = z.ZodType<unknown>;
    const recursive: RecSchema = z.lazy(() => z.object({ next: recursive }));
    expect(() => walkSchema(recursive as z.ZodTypeAny)).not.toThrow();
  });
});

describe('getUpstreamSchemas source precedence', () => {
  // A (http-request: concrete schema + example) -> B (target).
  const nodes = [
    mkNode('A', NodeType.HTTP_REQUEST, 'First'),
    mkNode('B', NodeType.HTTP_REQUEST, 'Second'),
  ];
  const edges = [mkEdge('A', 'B')];
  const pathsForA = (opts?: Parameters<typeof getUpstreamSchemas>[3]): string[] =>
    getUpstreamSchemas('B', nodes, edges, opts)
      .suggestions.filter((s) => s.nodeId === 'A')
      .map((s) => s.path);

  it('uses the concrete static schema over the curated example when no opts given', () => {
    const paths = pathsForA();
    // schema exposes `body` as an opaque field; the example would expand `body.result`
    expect(paths).toContain('body');
    expect(paths).toContain('statusCode');
    expect(paths).not.toContain('body.result');
  });

  it('lets a live output override the static schema', () => {
    const paths = pathsForA({
      liveNodes: new Map([['A', { output: { liveOnly: 'y' } }]]),
    });
    expect(paths).toEqual(['liveOnly']);
  });

  it('lets a live output beat a per-node override (a fresh run wins over a persisted sample)', () => {
    // A persisted __pillSample can go stale when the node's output shape changes;
    // the live run reflects the current shape, so it takes precedence.
    const paths = pathsForA({
      overrides: { A: { overrideOnly: 'x' } },
      liveNodes: new Map([['A', { output: { liveOnly: 'y' } }]]),
    });
    expect(paths).toEqual(['liveOnly']);
  });

  it('lets a per-node override beat the static schema when there is no live output', () => {
    const paths = pathsForA({
      overrides: { A: { overrideOnly: 'x' } },
    });
    expect(paths).toEqual(['overrideOnly']);
  });

  it('ignores a null live output and falls back to the schema', () => {
    const paths = pathsForA({ liveNodes: new Map([['A', { output: null }]]) });
    expect(paths).toContain('statusCode');
  });

  it('only records a Zod type in byNode for schema-sourced nodes', () => {
    const live = getUpstreamSchemas('B', nodes, edges, {
      liveNodes: new Map([['A', { output: { liveOnly: 'y' } }]]),
    });
    expect(live.byNode.A).toBeUndefined();

    const schema = getUpstreamSchemas('B', nodes, edges);
    expect(schema.byNode.A).toBeDefined();
  });
});
