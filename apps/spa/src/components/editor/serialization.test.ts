import { describe, it, expect } from 'vitest';
import type { Edge, Node } from 'reactflow';
import { NodeType, type WorkflowDefinition } from '@tietide/shared';
import type { CustomNodeData } from './nodes/CustomNode.types';
import { fromWorkflowDefinition, toWorkflowDefinition } from './serialization';

const makeRfNode = (
  overrides: Partial<Node<CustomNodeData>> & { id: string; data: CustomNodeData },
): Node<CustomNodeData> => ({
  type: 'custom',
  position: { x: 0, y: 0 },
  ...overrides,
});

// Hydration backfills a stable `alias` on every node; the structural round-trip
// tests below predate that enrichment, so drop aliases before comparing (alias
// backfill/persistence has its own dedicated tests).
const withoutAliases = (def: WorkflowDefinition): WorkflowDefinition => ({
  ...def,
  nodes: def.nodes.map((n) => {
    const copy = { ...n };
    delete copy.alias;
    return copy;
  }),
});

describe('serialization', () => {
  describe('toWorkflowDefinition', () => {
    it('should return empty nodes and edges when given empty inputs', () => {
      expect(toWorkflowDefinition([], [])).toEqual({ nodes: [], edges: [] });
    });

    it('should map CustomNodeData fields onto WorkflowNode shape', () => {
      const rfNode = makeRfNode({
        id: 'node-abc',
        position: { x: 120, y: 340 },
        data: {
          label: 'My HTTP Call',
          description: 'Make an HTTP request to an external API',
          nodeType: NodeType.HTTP_REQUEST,
          status: 'idle',
          config: { method: 'POST', url: 'https://example.com' },
        },
      });

      const def = toWorkflowDefinition([rfNode], []);

      expect(def.nodes).toEqual([
        {
          id: 'node-abc',
          type: NodeType.HTTP_REQUEST,
          name: 'My HTTP Call',
          position: { x: 120, y: 340 },
          config: { method: 'POST', url: 'https://example.com' },
        },
      ]);
    });

    it('should default config to an empty object when undefined on the source node', () => {
      const rfNode = makeRfNode({
        id: 'node-1',
        data: {
          label: 'Manual Trigger',
          nodeType: NodeType.MANUAL_TRIGGER,
        },
      });

      const def = toWorkflowDefinition([rfNode], []);

      expect(def.nodes[0].config).toEqual({});
    });

    it('should strip the runtime edge type (livingInk) from serialized edges', () => {
      const edge: Edge = {
        id: 'edge-1',
        source: 'a',
        target: 'b',
        type: 'livingInk',
      };

      const def = toWorkflowDefinition([], [edge]);

      expect(def.edges).toEqual([{ id: 'edge-1', source: 'a', target: 'b' }]);
      expect((def.edges[0] as unknown as { type?: string }).type).toBeUndefined();
    });

    it('should include sourceHandle and targetHandle only when present on the edge', () => {
      const withHandles: Edge = {
        id: 'edge-branch',
        source: 'cond',
        target: 'step',
        sourceHandle: 'true',
        targetHandle: 'in',
        type: 'livingInk',
      };
      const withoutHandles: Edge = {
        id: 'edge-plain',
        source: 'a',
        target: 'b',
        type: 'livingInk',
      };

      const def = toWorkflowDefinition([], [withHandles, withoutHandles]);

      expect(def.edges[0]).toEqual({
        id: 'edge-branch',
        source: 'cond',
        target: 'step',
        sourceHandle: 'true',
        targetHandle: 'in',
      });
      expect(def.edges[1]).toEqual({ id: 'edge-plain', source: 'a', target: 'b' });
      expect('sourceHandle' in def.edges[1]).toBe(false);
      expect('targetHandle' in def.edges[1]).toBe(false);
    });
  });

  describe('fromWorkflowDefinition', () => {
    it('should return empty nodes and edges when given an empty definition', () => {
      expect(fromWorkflowDefinition({ nodes: [], edges: [] })).toEqual({ nodes: [], edges: [] });
    });

    it('should rehydrate a WorkflowNode into a React Flow custom node with catalog description', () => {
      const def: WorkflowDefinition = {
        nodes: [
          {
            id: 'node-1',
            type: NodeType.CODE,
            name: 'Transform payload',
            position: { x: 50, y: 75 },
            config: { code: 'return input' },
          },
        ],
        edges: [],
      };

      const { nodes } = fromWorkflowDefinition(def);

      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toMatchObject({
        id: 'node-1',
        type: 'custom',
        position: { x: 50, y: 75 },
        data: {
          label: 'Transform payload',
          description: 'Execute custom JavaScript code',
          nodeType: NodeType.CODE,
          status: 'idle',
          config: { code: 'return input' },
        },
      });
    });

    it('should keep nodes with unknown types and fall back to an empty description', () => {
      const def: WorkflowDefinition = {
        nodes: [
          {
            id: 'node-legacy',
            type: 'legacy-node-type',
            name: 'Legacy',
            position: { x: 0, y: 0 },
            config: {},
          },
        ],
        edges: [],
      };

      const { nodes } = fromWorkflowDefinition(def);

      expect(nodes).toHaveLength(1);
      expect(nodes[0].data.description).toBe('');
      expect(nodes[0].data.nodeType).toBe('legacy-node-type');
    });

    it('should rehydrate edges with the livingInk edge type', () => {
      const def: WorkflowDefinition = {
        nodes: [],
        edges: [
          { id: 'edge-1', source: 'a', target: 'b' },
          { id: 'edge-2', source: 'c', target: 'd', sourceHandle: 'true' },
        ],
      };

      const { edges } = fromWorkflowDefinition(def);

      expect(edges).toEqual([
        { id: 'edge-1', source: 'a', target: 'b', type: 'livingInk' },
        { id: 'edge-2', source: 'c', target: 'd', sourceHandle: 'true', type: 'livingInk' },
      ]);
    });
  });

  describe('skipped flag', () => {
    it('should write skipped onto the WorkflowNode when set on data.skipped', () => {
      const rfNode = makeRfNode({
        id: 'n-skip',
        data: {
          label: 'Skip me',
          nodeType: NodeType.HTTP_REQUEST,
          status: 'idle',
          skipped: true,
        },
      });

      const def = toWorkflowDefinition([rfNode], []);

      expect(def.nodes[0].skipped).toBe(true);
    });

    it('should not include the skipped key when data.skipped is falsy', () => {
      const rfNode = makeRfNode({
        id: 'n-no-skip',
        data: { label: 'Plain', nodeType: NodeType.HTTP_REQUEST, status: 'idle' },
      });

      const def = toWorkflowDefinition([rfNode], []);

      expect('skipped' in def.nodes[0]).toBe(false);
    });

    it('should hydrate skipped from a WorkflowNode onto data.skipped', () => {
      const def: WorkflowDefinition = {
        nodes: [
          {
            id: 'n-1',
            type: NodeType.HTTP_REQUEST,
            name: 'Skipped',
            position: { x: 0, y: 0 },
            config: {},
            skipped: true,
          },
        ],
        edges: [],
      };

      const { nodes } = fromWorkflowDefinition(def);

      expect(nodes[0].data.skipped).toBe(true);
    });
  });

  describe('custom description', () => {
    it('persists data.description when it differs from the catalog default', () => {
      const rfNode = makeRfNode({
        id: 'n-desc',
        data: {
          label: 'My HTTP Call',
          description: 'Fetches the nightly orders report',
          nodeType: NodeType.HTTP_REQUEST,
          status: 'idle',
          config: {},
        },
      });

      const def = toWorkflowDefinition([rfNode], []);

      expect(def.nodes[0].description).toBe('Fetches the nightly orders report');
    });

    it('does not persist description when it equals the catalog default', () => {
      // Hydrate a node so data.description holds the exact catalog default, then
      // serialize: the default must not be baked into the saved definition.
      const { nodes } = fromWorkflowDefinition({
        nodes: [
          {
            id: 'n-1',
            type: NodeType.CODE,
            name: 'Transform payload',
            position: { x: 0, y: 0 },
            config: {},
          },
        ],
        edges: [],
      });

      const def = toWorkflowDefinition(nodes, []);

      expect('description' in def.nodes[0]).toBe(false);
    });

    it('does not persist an empty description', () => {
      const rfNode = makeRfNode({
        id: 'n-empty',
        data: { label: 'Plain', description: '', nodeType: NodeType.HTTP_REQUEST, status: 'idle' },
      });

      const def = toWorkflowDefinition([rfNode], []);

      expect('description' in def.nodes[0]).toBe(false);
    });

    it('rehydrates a persisted custom description over the catalog default', () => {
      const def: WorkflowDefinition = {
        nodes: [
          {
            id: 'n-1',
            type: NodeType.CODE,
            name: 'Transform payload',
            description: 'Custom prose the user wrote',
            position: { x: 0, y: 0 },
            config: {},
          },
        ],
        edges: [],
      };

      const { nodes } = fromWorkflowDefinition(def);

      expect(nodes[0].data.description).toBe('Custom prose the user wrote');
    });

    it('falls back to the catalog description when none is persisted', () => {
      const { nodes } = fromWorkflowDefinition({
        nodes: [
          {
            id: 'n-1',
            type: NodeType.CODE,
            name: 'Transform payload',
            position: { x: 0, y: 0 },
            config: {},
          },
        ],
        edges: [],
      });

      expect(nodes[0].data.description).toBe('Execute custom JavaScript code');
    });

    it('round-trips a node carrying a custom description', () => {
      const def: WorkflowDefinition = {
        nodes: [
          {
            id: 'n-1',
            type: NodeType.CODE,
            name: 'Transform payload',
            description: 'Custom prose the user wrote',
            position: { x: 0, y: 0 },
            config: {},
          },
        ],
        edges: [],
      };

      const hydrated = fromWorkflowDefinition(def);
      const roundTripped = toWorkflowDefinition(hydrated.nodes, hydrated.edges);

      expect(withoutAliases(roundTripped)).toEqual(def);
    });
  });

  describe('edge kind (error path)', () => {
    it('should write kind:"error" onto the WorkflowEdge when edge.data.kind is "error"', () => {
      const edge: Edge = {
        id: 'edge-err',
        source: 'a',
        target: 'b',
        type: 'livingInk',
        sourceHandle: 'error',
        data: { kind: 'error' },
      };

      const def = toWorkflowDefinition([], [edge]);

      expect(def.edges[0]).toEqual({
        id: 'edge-err',
        source: 'a',
        target: 'b',
        sourceHandle: 'error',
        kind: 'error',
      });
    });

    it('should not include kind when edge.data.kind is missing or "success"', () => {
      const plain: Edge = { id: 'e-plain', source: 'a', target: 'b', type: 'livingInk' };
      const succ: Edge = {
        id: 'e-succ',
        source: 'a',
        target: 'b',
        type: 'livingInk',
        data: { kind: 'success' },
      };

      const def = toWorkflowDefinition([], [plain, succ]);

      expect('kind' in def.edges[0]).toBe(false);
      expect('kind' in def.edges[1]).toBe(false);
    });

    it('should hydrate kind:"error" from a WorkflowEdge onto edge.data.kind', () => {
      const def: WorkflowDefinition = {
        nodes: [],
        edges: [
          {
            id: 'e-err',
            source: 'a',
            target: 'b',
            sourceHandle: 'error',
            kind: 'error',
          },
        ],
      };

      const { edges } = fromWorkflowDefinition(def);

      expect(edges[0]).toMatchObject({
        id: 'e-err',
        source: 'a',
        target: 'b',
        sourceHandle: 'error',
        type: 'livingInk',
        data: { kind: 'error' },
      });
    });

    it('should round-trip a workflow with both success and error edges', () => {
      const def: WorkflowDefinition = {
        nodes: [
          {
            id: 'A',
            type: NodeType.HTTP_REQUEST,
            name: 'A',
            position: { x: 0, y: 0 },
            config: {},
          },
          {
            id: 'B',
            type: NodeType.HTTP_REQUEST,
            name: 'B',
            position: { x: 100, y: 0 },
            config: {},
          },
          {
            id: 'C',
            type: NodeType.HTTP_REQUEST,
            name: 'C',
            position: { x: 100, y: 100 },
            config: {},
          },
        ],
        edges: [
          { id: 'e-ok', source: 'A', target: 'B' },
          { id: 'e-err', source: 'A', target: 'C', sourceHandle: 'error', kind: 'error' },
        ],
      };

      const hydrated = fromWorkflowDefinition(def);
      const roundTripped = toWorkflowDefinition(hydrated.nodes, hydrated.edges);

      expect(withoutAliases(roundTripped)).toEqual(def);
    });
  });

  describe('sticky notes', () => {
    it('should rehydrate a sticky WorkflowNode as a React Flow node with type="sticky"', () => {
      const def: WorkflowDefinition = {
        nodes: [
          {
            id: 's1',
            type: NodeType.STICKY,
            name: 'Sticky Note',
            position: { x: 10, y: 20 },
            config: { text: 'TODO', color: 'pink', width: 240, height: 160 },
          },
        ],
        edges: [],
      };

      const { nodes } = fromWorkflowDefinition(def);

      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toMatchObject({
        id: 's1',
        type: 'sticky',
        position: { x: 10, y: 20 },
        data: {
          nodeType: NodeType.STICKY,
          config: { text: 'TODO', color: 'pink', width: 240, height: 160 },
        },
      });
    });

    it('should round-trip a workflow that contains a sticky alongside real nodes', () => {
      const def: WorkflowDefinition = {
        nodes: [
          {
            id: 't1',
            type: NodeType.MANUAL_TRIGGER,
            name: 'Start',
            position: { x: 0, y: 0 },
            config: {},
          },
          {
            id: 's1',
            type: NodeType.STICKY,
            name: 'Sticky Note',
            position: { x: 200, y: 0 },
            config: { text: 'docs', color: 'green', width: 220, height: 140 },
          },
        ],
        edges: [],
      };

      const hydrated = fromWorkflowDefinition(def);
      const roundTripped = toWorkflowDefinition(hydrated.nodes, hydrated.edges);

      expect(withoutAliases(roundTripped)).toEqual(def);
    });
  });

  describe('round-trip', () => {
    it('should preserve a canonical WorkflowDefinition through from→to', () => {
      const def: WorkflowDefinition = {
        nodes: [
          {
            id: 'n-1',
            type: NodeType.MANUAL_TRIGGER,
            name: 'Start',
            position: { x: 10, y: 20 },
            config: {},
          },
          {
            id: 'n-2',
            type: NodeType.CONDITIONAL,
            name: 'Branch',
            position: { x: 200, y: 100 },
            config: { expression: 'input.ok === true' },
          },
        ],
        edges: [
          { id: 'e-1', source: 'n-1', target: 'n-2' },
          { id: 'e-2', source: 'n-2', target: 'n-1', sourceHandle: 'false' },
        ],
      };

      const hydrated = fromWorkflowDefinition(def);
      const roundTripped = toWorkflowDefinition(hydrated.nodes, hydrated.edges);

      expect(withoutAliases(roundTripped)).toEqual(def);
    });
  });

  describe('alias handling', () => {
    it('backfills stable aliases for legacy definitions missing them', () => {
      const def: WorkflowDefinition = {
        nodes: [
          {
            id: 'n-1',
            type: NodeType.MANUAL_TRIGGER,
            name: 'Manual Trigger',
            position: { x: 0, y: 0 },
            config: {},
          },
          {
            id: 'n-2',
            type: NodeType.CODE,
            name: 'Code',
            position: { x: 0, y: 0 },
            config: {},
          },
        ],
        edges: [],
      };

      const { nodes } = fromWorkflowDefinition(def);
      expect(nodes[0].data.alias).toBe('trigger');
      expect(nodes[1].data.alias).toBe('code');
    });

    it('persists a node alias back into the definition', () => {
      const rfNode = makeRfNode({
        id: 'node-abc',
        data: {
          label: 'Code',
          nodeType: NodeType.CODE,
          status: 'idle',
          config: {},
          alias: 'code',
        },
      });
      expect(toWorkflowDefinition([rfNode], [])).toMatchObject({
        nodes: [{ id: 'node-abc', alias: 'code' }],
      });
    });
  });
});
