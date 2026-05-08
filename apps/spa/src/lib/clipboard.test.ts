import { describe, it, expect } from 'vitest';
import type { Edge, Node } from 'reactflow';
import { NodeType } from '@tietide/shared';
import type { CustomNodeData } from '@/components/editor/nodes/CustomNode.types';
import {
  buildClipboardPayload,
  CLIPBOARD_VERSION,
  ClipboardFormatError,
  ClipboardPayloadSchema,
  parseClipboardPayload,
  remapClipboardIds,
  serializeClipboardPayload,
} from './clipboard';

const makeNode = (
  id: string,
  overrides: Partial<Node<CustomNodeData>> = {},
): Node<CustomNodeData> => ({
  id,
  type: 'custom',
  position: { x: 100, y: 200 },
  data: {
    label: 'HTTP Request',
    description: 'Make HTTP request',
    nodeType: NodeType.HTTP_REQUEST,
    status: 'idle',
    config: { url: 'https://example.com' },
  },
  ...overrides,
});

const makeEdge = (id: string, source: string, target: string): Edge => ({
  id,
  source,
  target,
  type: 'livingInk',
});

describe('clipboard', () => {
  describe('buildClipboardPayload', () => {
    it('should include only the supplied selected nodes (AC #1)', () => {
      const a = makeNode('node-a');
      // node-b exists in the graph but is not part of the selection
      const payload = buildClipboardPayload([a], [makeEdge('e1', 'node-a', 'node-b')]);

      expect(payload.nodes).toHaveLength(1);
      expect(payload.nodes[0].id).toBe('node-a');
      // unrelated node-b is not in the selection, so its incident edge must drop
      expect(payload.edges).toHaveLength(0);
    });

    it('should keep edges where both endpoints are in the selection', () => {
      const a = makeNode('node-a');
      const b = makeNode('node-b');
      // node-c is in the graph and connected to a, but is NOT in the selection
      const payload = buildClipboardPayload(
        [a, b],
        [makeEdge('e1', 'node-a', 'node-b'), makeEdge('e2', 'node-a', 'node-c')],
      );

      expect(payload.edges).toHaveLength(1);
      expect(payload.edges[0]).toMatchObject({ source: 'node-a', target: 'node-b' });
    });

    it('should drop edges where either endpoint is unselected (AC #5)', () => {
      const a = makeNode('node-a');
      const payload = buildClipboardPayload(
        [a],
        [
          makeEdge('e-out', 'node-a', 'node-b'),
          makeEdge('e-in', 'node-c', 'node-a'),
          makeEdge('e-other', 'node-c', 'node-d'),
        ],
      );

      expect(payload.edges).toHaveLength(0);
    });

    it('should strip transient React Flow fields (selected, dragging, dimensions)', () => {
      const node = makeNode('node-a', {
        selected: true,
        dragging: false,
        width: 240,
        height: 96,
        positionAbsolute: { x: 999, y: 888 },
      } as Partial<Node<CustomNodeData>>);
      const payload = buildClipboardPayload([node], []);
      const serialized = JSON.stringify(payload);

      expect(serialized).not.toContain('"selected"');
      expect(serialized).not.toContain('"dragging"');
      expect(serialized).not.toContain('"width"');
      expect(serialized).not.toContain('"height"');
      expect(serialized).not.toContain('"positionAbsolute"');
    });

    it('should preserve data.skipped when true (regression for #113)', () => {
      const skipped = makeNode('node-a', {
        data: {
          ...makeNode('node-a').data,
          skipped: true,
        },
      });
      const payload = buildClipboardPayload([skipped], []);
      expect(payload.nodes[0].data.skipped).toBe(true);
    });

    it('should preserve sourceHandle and targetHandle when present', () => {
      const a = makeNode('node-a');
      const b = makeNode('node-b');
      const edge: Edge = {
        id: 'e1',
        source: 'node-a',
        target: 'node-b',
        sourceHandle: 'out-1',
        targetHandle: 'in-2',
      };
      const payload = buildClipboardPayload([a, b], [edge]);
      expect(payload.edges[0].sourceHandle).toBe('out-1');
      expect(payload.edges[0].targetHandle).toBe('in-2');
    });
  });

  describe('serializeClipboardPayload', () => {
    it('should write JSON containing the tietideClipboard: 1 marker (AC #2)', () => {
      const node = makeNode('node-a');
      const payload = buildClipboardPayload([node], []);
      const json = serializeClipboardPayload(payload);
      const parsed = JSON.parse(json) as { tietideClipboard: number };

      expect(parsed.tietideClipboard).toBe(CLIPBOARD_VERSION);
      expect(parsed.tietideClipboard).toBe(1);
    });
  });

  describe('parseClipboardPayload', () => {
    it('should accept a valid payload round-tripped through serialize', () => {
      const node = makeNode('node-a');
      const json = serializeClipboardPayload(buildClipboardPayload([node], []));
      const parsed = parseClipboardPayload(json);

      expect(parsed.tietideClipboard).toBe(CLIPBOARD_VERSION);
      expect(parsed.nodes[0].id).toBe('node-a');
    });

    it('should throw ClipboardFormatError on malformed JSON (AC #7)', () => {
      expect(() => parseClipboardPayload('not json')).toThrow(ClipboardFormatError);
    });

    it('should throw ClipboardFormatError when the tietideClipboard marker is missing (AC #7)', () => {
      const json = JSON.stringify({ nodes: [], edges: [] });
      expect(() => parseClipboardPayload(json)).toThrow(ClipboardFormatError);
    });

    it('should throw ClipboardFormatError on a wrong version', () => {
      const json = JSON.stringify({ tietideClipboard: 2, nodes: [], edges: [] });
      expect(() => parseClipboardPayload(json)).toThrow(ClipboardFormatError);
    });

    it('should throw ClipboardFormatError when a node is missing required fields', () => {
      const json = JSON.stringify({
        tietideClipboard: 1,
        nodes: [{ id: 'node-a' }],
        edges: [],
      });
      expect(() => parseClipboardPayload(json)).toThrow(ClipboardFormatError);
    });
  });

  describe('ClipboardPayloadSchema', () => {
    it('should expose a Zod schema that mirrors parseClipboardPayload', () => {
      const a = makeNode('node-a');
      const payload = buildClipboardPayload([a], []);
      expect(ClipboardPayloadSchema.safeParse(payload).success).toBe(true);
      expect(ClipboardPayloadSchema.safeParse({ tietideClipboard: 1 }).success).toBe(false);
    });
  });

  describe('remapClipboardIds', () => {
    it('should regenerate every node id (no overlap with originals) (AC #3)', () => {
      const a = makeNode('node-a');
      const b = makeNode('node-b');
      const payload = buildClipboardPayload([a, b], []);
      const remapped = remapClipboardIds(payload);

      expect(remapped.nodes).toHaveLength(2);
      const newIds = remapped.nodes.map((n) => n.id);
      expect(newIds).not.toContain('node-a');
      expect(newIds).not.toContain('node-b');
      expect(new Set(newIds).size).toBe(2);
      newIds.forEach((id) => expect(id).toMatch(/^node-/));
    });

    it('should preserve edges between pasted nodes via the id mapping (AC #4)', () => {
      const a = makeNode('node-a');
      const b = makeNode('node-b');
      const payload = buildClipboardPayload([a, b], [makeEdge('e1', 'node-a', 'node-b')]);
      const remapped = remapClipboardIds(payload);

      expect(remapped.edges).toHaveLength(1);
      const [src, tgt] = remapped.nodes;
      expect(remapped.edges[0].source).toBe(src.id);
      expect(remapped.edges[0].target).toBe(tgt.id);
    });

    it('should drop edges whose endpoints are not in the payload (AC #5, defensive)', () => {
      const a = makeNode('node-a');
      const payload = {
        tietideClipboard: 1 as const,
        nodes: [{ id: a.id, type: a.type, position: a.position, data: a.data }],
        edges: [{ id: 'e1', source: 'node-a', target: 'node-ghost' }],
      };
      const remapped = remapClipboardIds(payload);
      expect(remapped.edges).toHaveLength(0);
    });

    it('should apply a +30/+30 position offset by default (AC #8)', () => {
      const a = makeNode('node-a', { position: { x: 50, y: 100 } });
      const payload = buildClipboardPayload([a], []);
      const remapped = remapClipboardIds(payload);
      expect(remapped.nodes[0].position).toEqual({ x: 80, y: 130 });
    });

    it('should respect a custom offset', () => {
      const a = makeNode('node-a', { position: { x: 0, y: 0 } });
      const payload = buildClipboardPayload([a], []);
      const remapped = remapClipboardIds(payload, { offset: { x: -10, y: 5 } });
      expect(remapped.nodes[0].position).toEqual({ x: -10, y: 5 });
    });

    it('should regenerate edge ids with the edge- prefix', () => {
      const a = makeNode('node-a');
      const b = makeNode('node-b');
      const payload = buildClipboardPayload(
        [a, b],
        [makeEdge('original-edge-id', 'node-a', 'node-b')],
      );
      const remapped = remapClipboardIds(payload);
      expect(remapped.edges[0].id).not.toBe('original-edge-id');
      expect(remapped.edges[0].id).toMatch(/^edge-/);
    });

    it('should set edge type to livingInk on remapped edges', () => {
      const a = makeNode('node-a');
      const b = makeNode('node-b');
      const payload = buildClipboardPayload([a, b], [makeEdge('e1', 'node-a', 'node-b')]);
      const remapped = remapClipboardIds(payload);
      expect(remapped.edges[0].type).toBe('livingInk');
    });

    it('should reset node status to idle so pasted copies do not carry stale execution markers', () => {
      const a = makeNode('node-a', {
        data: {
          ...makeNode('node-a').data,
          status: 'failed',
        },
      });
      const payload = buildClipboardPayload([a], []);
      const remapped = remapClipboardIds(payload);
      expect(remapped.nodes[0].data.status).toBe('idle');
    });

    it('should expose the old-to-new id mapping', () => {
      const a = makeNode('node-a');
      const b = makeNode('node-b');
      const payload = buildClipboardPayload([a, b], []);
      const remapped = remapClipboardIds(payload);

      expect(remapped.idMap).toHaveProperty('node-a');
      expect(remapped.idMap).toHaveProperty('node-b');
      expect(remapped.idMap['node-a']).toBe(remapped.nodes[0].id);
      expect(remapped.idMap['node-b']).toBe(remapped.nodes[1].id);
    });

    it('should round-trip a sticky note preserving its React Flow type and config', () => {
      const sticky: Node<CustomNodeData> = {
        id: 'sticky-1',
        type: 'sticky',
        position: { x: 30, y: 40 },
        data: {
          label: 'Sticky Note',
          nodeType: NodeType.STICKY,
          status: 'idle',
          config: { text: 'note', color: 'blue', width: 240, height: 160 },
        },
      };

      const payload = buildClipboardPayload([sticky], []);
      const json = serializeClipboardPayload(payload);
      const parsed = parseClipboardPayload(json);
      const remapped = remapClipboardIds(parsed);

      expect(remapped.nodes).toHaveLength(1);
      expect(remapped.nodes[0].type).toBe('sticky');
      expect(remapped.nodes[0].data.nodeType).toBe(NodeType.STICKY);
      expect(remapped.nodes[0].data.config).toEqual({
        text: 'note',
        color: 'blue',
        width: 240,
        height: 160,
      });
    });
  });
});
