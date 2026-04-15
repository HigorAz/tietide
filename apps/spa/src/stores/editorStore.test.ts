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
          config: {},
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

  describe('selectNode', () => {
    it('should set selectedNodeId to the given id', () => {
      useEditorStore.getState().selectNode('node-abc');
      expect(useEditorStore.getState().selectedNodeId).toBe('node-abc');
    });

    it('should clear selectedNodeId when called with null', () => {
      useEditorStore.setState({ selectedNodeId: 'node-abc' });
      useEditorStore.getState().selectNode(null);
      expect(useEditorStore.getState().selectedNodeId).toBeNull();
    });

    it('should not mark the store dirty when changing selection', () => {
      expect(useEditorStore.getState().isDirty).toBe(false);
      useEditorStore.getState().selectNode('node-abc');
      expect(useEditorStore.getState().isDirty).toBe(false);
      useEditorStore.getState().selectNode(null);
      expect(useEditorStore.getState().isDirty).toBe(false);
    });
  });

  describe('updateNodeConfig', () => {
    it('should shallow-merge the patch into the targeted node data.config', () => {
      const { addNode, updateNodeConfig } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      const nodeId = useEditorStore.getState().nodes[0].id;

      updateNodeConfig(nodeId, { method: 'POST', url: 'https://example.com' });
      expect(useEditorStore.getState().nodes[0].data.config).toEqual({
        method: 'POST',
        url: 'https://example.com',
      });

      updateNodeConfig(nodeId, { method: 'GET' });
      expect(useEditorStore.getState().nodes[0].data.config).toEqual({
        method: 'GET',
        url: 'https://example.com',
      });
    });

    it('should mark the store dirty after updating config', () => {
      const { addNode, updateNodeConfig } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      useEditorStore.setState({ isDirty: false });

      updateNodeConfig(useEditorStore.getState().nodes[0].id, { method: 'POST' });
      expect(useEditorStore.getState().isDirty).toBe(true);
    });

    it('should be a no-op when the target node id does not exist', () => {
      const { addNode, updateNodeConfig } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      useEditorStore.setState({ isDirty: false });
      const snapshot = useEditorStore.getState().nodes;

      updateNodeConfig('node-does-not-exist', { method: 'POST' });

      expect(useEditorStore.getState().nodes).toEqual(snapshot);
      expect(useEditorStore.getState().isDirty).toBe(false);
    });
  });

  describe('onNodesChange — removal with selection', () => {
    it('should clear selectedNodeId when the selected node is removed', () => {
      const { addNode, onNodesChange, selectNode } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      const nodeId = useEditorStore.getState().nodes[0].id;
      selectNode(nodeId);

      onNodesChange([{ id: nodeId, type: 'remove' }]);

      expect(useEditorStore.getState().nodes).toHaveLength(0);
      expect(useEditorStore.getState().selectedNodeId).toBeNull();
    });

    it('should leave selectedNodeId untouched when an unselected node is removed', () => {
      const { addNode, onNodesChange, selectNode } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      addNode(NodeType.CRON_TRIGGER, { x: 100, y: 0 });
      const [first, second] = useEditorStore.getState().nodes;
      selectNode(first.id);

      onNodesChange([{ id: second.id, type: 'remove' }]);

      expect(useEditorStore.getState().selectedNodeId).toBe(first.id);
    });
  });
});
