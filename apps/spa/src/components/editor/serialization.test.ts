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

      expect(roundTripped).toEqual(def);
    });
  });
});
