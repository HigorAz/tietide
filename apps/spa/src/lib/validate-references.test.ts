import { describe, it, expect } from 'vitest';
import type { Edge, Node } from 'reactflow';
import { NodeType, PILL_SAMPLE_KEY } from '@tietide/shared';
import type { CustomNodeData } from '@/components/editor/nodes/CustomNode.types';
import { findInvalidReferences, invalidTokensForNode } from './validate-references';

const N = (
  id: string,
  nodeType: NodeType,
  label: string,
  config: Record<string, unknown> = {},
): Node<CustomNodeData> => ({
  id,
  type: 'custom',
  position: { x: 0, y: 0 },
  data: { label, nodeType, status: 'idle', config },
});

const E = (source: string, target: string): Edge => ({
  id: `${source}->${target}`,
  source,
  target,
});

const graph = (sinkConfig: Record<string, unknown>) => {
  const nodes = [
    N('t', NodeType.MANUAL_TRIGGER, 'Trigger'),
    N('a', NodeType.HTTP_REQUEST, 'First HTTP'), // alias first_http
    N('d', NodeType.HTTP_REQUEST, 'Detached'), // alias detached, not upstream of sink
    N('b', NodeType.HTTP_REQUEST, 'Sink', sinkConfig),
  ];
  const edges = [E('t', 'a'), E('a', 'b')];
  return { nodes, edges };
};

describe('findInvalidReferences', () => {
  it('passes a valid upstream reference to a concrete field', () => {
    const { nodes, edges } = graph({ url: '{{steps.first_http.statusCode}}' });
    expect(findInvalidReferences(nodes, edges)).toEqual([]);
  });

  it('flags a reference to a node that no longer exists (deletion)', () => {
    const { nodes, edges } = graph({ url: '{{steps.ghost.statusCode}}' });
    const invalid = findInvalidReferences(nodes, edges);
    expect(invalid).toHaveLength(1);
    expect(invalid[0]).toMatchObject({ nodeId: 'b', reason: 'missing' });
  });

  it('flags a reference to a node that is not upstream', () => {
    const { nodes, edges } = graph({ url: '{{steps.detached.statusCode}}' });
    const invalid = findInvalidReferences(nodes, edges);
    expect(invalid).toHaveLength(1);
    expect(invalid[0]).toMatchObject({ reason: 'not-upstream' });
  });

  it('flags an unknown field on a node with a concrete schema (trigger-replacement case)', () => {
    const { nodes, edges } = graph({ url: '{{steps.first_http.nope}}' });
    const invalid = findInvalidReferences(nodes, edges);
    expect(invalid).toHaveLength(1);
    expect(invalid[0]).toMatchObject({ reason: 'unknown-field' });
  });

  it('does not flag env-var tokens', () => {
    const { nodes, edges } = graph({ url: '{{API_KEY}}' });
    expect(findInvalidReferences(nodes, edges)).toEqual([]);
  });

  it('does not flag deletion of one node when a sibling reference stays valid', () => {
    const { nodes, edges } = graph({
      ok: '{{steps.first_http.body}}',
      broken: '{{steps.ghost.x}}',
    });
    const invalid = findInvalidReferences(nodes, edges);
    expect(invalid.map((r) => r.reason)).toEqual(['missing']);
  });
});

describe('findInvalidReferences with __pillSample overrides', () => {
  // Code's static output schema is { result, duration } — `count` only exists
  // when the node carries an OUTPUT SAMPLE (or a "Test this node" capture).
  const codeGraph = (sinkConfig: Record<string, unknown>, sample?: unknown) => {
    const codeConfig = sample === undefined ? {} : { [PILL_SAMPLE_KEY]: sample };
    const nodes = [
      N('t', NodeType.MANUAL_TRIGGER, 'Trigger'),
      N('c', NodeType.CODE, 'Code', codeConfig), // alias `code`
      N('b', NodeType.HTTP_REQUEST, 'Sink', sinkConfig),
    ];
    const edges = [E('t', 'c'), E('c', 'b')];
    return { nodes, edges };
  };

  it('does not flag a field that exists only in the node OUTPUT SAMPLE', () => {
    const { nodes, edges } = codeGraph({ url: '{{steps.code.count}}' }, { count: '1' });
    expect(findInvalidReferences(nodes, edges)).toEqual([]);
  });

  it('accepts a pill sample stored as a JSON string (as the form persists it)', () => {
    const { nodes, edges } = codeGraph(
      { url: '{{steps.code.count}}' },
      JSON.stringify({ count: '1' }),
    );
    expect(findInvalidReferences(nodes, edges)).toEqual([]);
  });

  it('still flags a field absent from both the sample and the static schema', () => {
    const { nodes, edges } = codeGraph({ url: '{{steps.code.nope}}' }, { count: '1' });
    const invalid = findInvalidReferences(nodes, edges);
    expect(invalid).toHaveLength(1);
    expect(invalid[0]).toMatchObject({ reason: 'unknown-field' });
  });

  it('without a sample, the static code schema still rejects an unknown field', () => {
    const { nodes, edges } = codeGraph({ url: '{{steps.code.count}}' });
    const invalid = findInvalidReferences(nodes, edges);
    expect(invalid).toHaveLength(1);
    expect(invalid[0]).toMatchObject({ reason: 'unknown-field' });
  });
});

describe('invalidTokensForNode', () => {
  it('returns only the invalid tokens for the node (valid + env excluded)', () => {
    const { nodes, edges } = graph({
      good: '{{steps.first_http.statusCode}}',
      env: '{{API_KEY}}',
      missing: '{{steps.ghost.x}}',
    });
    const tokens = invalidTokensForNode('b', nodes, edges);
    expect(tokens).toEqual(new Set(['{{steps.ghost.x}}']));
  });
});
