import { describe, it, expect, beforeEach } from 'vitest';
import { NodeType } from '@tietide/shared';
import { initialEditorState, useEditorStore } from './editorStore';

describe('editorStore', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
  });

  describe('addNode', () => {
    it('should add a custom node with catalog-derived label, description, and idle status', () => {
      useEditorStore.getState().addNode(NodeType.MANUAL_TRIGGER, { x: 100, y: 200 });

      const { nodes } = useEditorStore.getState();
      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toMatchObject({
        type: 'custom',
        position: { x: 100, y: 200 },
        data: {
          label: 'Manual Trigger',
          description: 'Start workflow manually',
          nodeType: NodeType.MANUAL_TRIGGER,
          status: 'idle',
        },
      });
      expect(nodes[0].id).toEqual(expect.stringMatching(/^node-/));
    });

    it('should assign a distinct id to every added node', () => {
      const { addNode } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      addNode(NodeType.HTTP_REQUEST, { x: 50, y: 50 });

      const { nodes } = useEditorStore.getState();
      expect(nodes).toHaveLength(2);
      expect(nodes[0].id).not.toBe(nodes[1].id);
    });

    it('should mark the store dirty after adding a node', () => {
      expect(useEditorStore.getState().isDirty).toBe(false);
      useEditorStore.getState().addNode(NodeType.CODE, { x: 0, y: 0 });
      expect(useEditorStore.getState().isDirty).toBe(true);
    });

    it('should be a no-op when the node type is not in the catalog', () => {
      useEditorStore.getState().addNode('not-a-real-type' as unknown as NodeType, { x: 0, y: 0 });
      expect(useEditorStore.getState().nodes).toHaveLength(0);
      expect(useEditorStore.getState().isDirty).toBe(false);
    });
  });

  describe('onNodesChange', () => {
    it('should apply a position change to an existing node', () => {
      const { addNode, onNodesChange } = useEditorStore.getState();
      addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      const nodeId = useEditorStore.getState().nodes[0].id;

      onNodesChange([
        { id: nodeId, type: 'position', position: { x: 100, y: 200 }, dragging: false },
      ]);

      expect(useEditorStore.getState().nodes[0].position).toEqual({ x: 100, y: 200 });
    });
  });

  describe('onConnect', () => {
    it('should add a livingInk edge between two nodes', () => {
      const { addNode, onConnect } = useEditorStore.getState();
      addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      addNode(NodeType.HTTP_REQUEST, { x: 200, y: 0 });
      const [source, target] = useEditorStore.getState().nodes;

      onConnect({
        source: source.id,
        target: target.id,
        sourceHandle: null,
        targetHandle: null,
      });

      const { edges } = useEditorStore.getState();
      expect(edges).toHaveLength(1);
      expect(edges[0]).toMatchObject({
        source: source.id,
        target: target.id,
        type: 'livingInk',
      });
    });
  });
});
