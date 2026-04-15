import { describe, it, expect, beforeEach } from 'vitest';
import { NodeType, type WorkflowDefinition } from '@tietide/shared';
import { initialEditorState, useEditorStore } from './editorStore';

describe('editorStore — history and workflow lifecycle', () => {
  beforeEach(() => {
    useEditorStore.setState({ ...initialEditorState });
  });

  describe('undo/redo — addNode', () => {
    it('should push a snapshot when a node is added', () => {
      expect(useEditorStore.getState().past).toHaveLength(0);

      useEditorStore.getState().addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });

      expect(useEditorStore.getState().past).toHaveLength(1);
      expect(useEditorStore.getState().past[0].nodes).toHaveLength(0);
    });

    it('should restore the previous nodes and edges when undo is called', () => {
      const { addNode, undo } = useEditorStore.getState();
      addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      expect(useEditorStore.getState().nodes).toHaveLength(1);

      undo();

      expect(useEditorStore.getState().nodes).toHaveLength(0);
      expect(useEditorStore.getState().future).toHaveLength(1);
    });

    it('should reapply an undone mutation when redo is called', () => {
      const { addNode, undo, redo } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 10, y: 20 });
      undo();
      expect(useEditorStore.getState().nodes).toHaveLength(0);

      redo();

      expect(useEditorStore.getState().nodes).toHaveLength(1);
      expect(useEditorStore.getState().nodes[0].data.nodeType).toBe(NodeType.HTTP_REQUEST);
      expect(useEditorStore.getState().future).toHaveLength(0);
    });

    it('should clear the future stack on a new mutation after undo', () => {
      const { addNode, undo } = useEditorStore.getState();
      addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      undo();
      expect(useEditorStore.getState().future).toHaveLength(1);

      useEditorStore.getState().addNode(NodeType.CODE, { x: 0, y: 0 });

      expect(useEditorStore.getState().future).toHaveLength(0);
    });

    it('should be a no-op when undo is called with an empty past stack', () => {
      const before = useEditorStore.getState().nodes;

      useEditorStore.getState().undo();

      expect(useEditorStore.getState().nodes).toBe(before);
      expect(useEditorStore.getState().past).toHaveLength(0);
      expect(useEditorStore.getState().future).toHaveLength(0);
    });

    it('should be a no-op when redo is called with an empty future stack', () => {
      const before = useEditorStore.getState().nodes;

      useEditorStore.getState().redo();

      expect(useEditorStore.getState().nodes).toBe(before);
      expect(useEditorStore.getState().future).toHaveLength(0);
    });

    it('should bound the past stack to 50 snapshots', () => {
      const { addNode } = useEditorStore.getState();
      for (let i = 0; i < 55; i += 1) {
        addNode(NodeType.MANUAL_TRIGGER, { x: i, y: 0 });
      }

      expect(useEditorStore.getState().past.length).toBe(50);
    });
  });

  describe('onNodesChange — drag-end snapshot rule', () => {
    it('should NOT push a snapshot for a mid-drag position change (dragging: true)', () => {
      const { addNode, onNodesChange } = useEditorStore.getState();
      addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      const id = useEditorStore.getState().nodes[0].id;
      const historyBefore = useEditorStore.getState().past.length;

      onNodesChange([{ id, type: 'position', position: { x: 50, y: 50 }, dragging: true }]);

      expect(useEditorStore.getState().past.length).toBe(historyBefore);
      expect(useEditorStore.getState().nodes[0].position).toEqual({ x: 50, y: 50 });
    });

    it('should push a snapshot on drag end (position change with dragging: false)', () => {
      const { addNode, onNodesChange } = useEditorStore.getState();
      addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      const id = useEditorStore.getState().nodes[0].id;
      const historyBefore = useEditorStore.getState().past.length;

      onNodesChange([{ id, type: 'position', position: { x: 100, y: 200 }, dragging: false }]);

      expect(useEditorStore.getState().past.length).toBe(historyBefore + 1);
    });

    it('should push a snapshot on node removal', () => {
      const { addNode, onNodesChange } = useEditorStore.getState();
      addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      const id = useEditorStore.getState().nodes[0].id;
      const historyBefore = useEditorStore.getState().past.length;

      onNodesChange([{ id, type: 'remove' }]);

      expect(useEditorStore.getState().past.length).toBe(historyBefore + 1);
      expect(useEditorStore.getState().nodes).toHaveLength(0);
    });

    it('should NOT push a snapshot for a pure selection change', () => {
      const { addNode, onNodesChange } = useEditorStore.getState();
      addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      const id = useEditorStore.getState().nodes[0].id;
      const historyBefore = useEditorStore.getState().past.length;

      onNodesChange([{ id, type: 'select', selected: true }]);

      expect(useEditorStore.getState().past.length).toBe(historyBefore);
    });
  });

  describe('loadWorkflow', () => {
    it('should replace nodes and edges, set workflowId, and clear dirty + history', () => {
      const { addNode, loadWorkflow } = useEditorStore.getState();
      addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      expect(useEditorStore.getState().past.length).toBeGreaterThan(0);
      expect(useEditorStore.getState().isDirty).toBe(true);

      const def: WorkflowDefinition = {
        nodes: [
          {
            id: 'n-loaded',
            type: NodeType.HTTP_REQUEST,
            name: 'Loaded',
            position: { x: 5, y: 5 },
            config: { method: 'GET' },
          },
        ],
        edges: [],
      };
      loadWorkflow({ id: 'wf-1', definition: def });

      const state = useEditorStore.getState();
      expect(state.workflowId).toBe('wf-1');
      expect(state.nodes).toHaveLength(1);
      expect(state.nodes[0].id).toBe('n-loaded');
      expect(state.nodes[0].type).toBe('custom');
      expect(state.nodes[0].data.nodeType).toBe(NodeType.HTTP_REQUEST);
      expect(state.isDirty).toBe(false);
      expect(state.past).toHaveLength(0);
      expect(state.future).toHaveLength(0);
    });
  });

  describe('markSaved', () => {
    it('should clear isDirty without touching history', () => {
      const { addNode, markSaved } = useEditorStore.getState();
      addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      const pastBefore = useEditorStore.getState().past.length;
      expect(useEditorStore.getState().isDirty).toBe(true);

      markSaved();

      expect(useEditorStore.getState().isDirty).toBe(false);
      expect(useEditorStore.getState().past.length).toBe(pastBefore);
    });
  });

  describe('resetEditor', () => {
    it('should restore the initial state and clear history + workflowId', () => {
      const { addNode, loadWorkflow, resetEditor } = useEditorStore.getState();
      loadWorkflow({ id: 'wf-9', definition: { nodes: [], edges: [] } });
      addNode(NodeType.CODE, { x: 0, y: 0 });
      useEditorStore.getState().selectNode('node-x');

      resetEditor();

      const state = useEditorStore.getState();
      expect(state.nodes).toHaveLength(0);
      expect(state.edges).toHaveLength(0);
      expect(state.past).toHaveLength(0);
      expect(state.future).toHaveLength(0);
      expect(state.isDirty).toBe(false);
      expect(state.selectedNodeId).toBeNull();
      expect(state.workflowId).toBeNull();
    });
  });
});
