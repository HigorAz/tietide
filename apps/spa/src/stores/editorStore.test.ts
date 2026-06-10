import { describe, it, expect, beforeEach } from 'vitest';
import { NodeType } from '@tietide/shared';
import { buildClipboardPayload, CLIPBOARD_VERSION, type ClipboardPayload } from '@/lib/clipboard';
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
      useEditorStore.getState().addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      expect(useEditorStore.getState().isDirty).toBe(true);
    });

    it('should be a no-op when the node type is not in the catalog', () => {
      useEditorStore.getState().addNode('not-a-real-type' as unknown as NodeType, { x: 0, y: 0 });
      expect(useEditorStore.getState().nodes).toHaveLength(0);
      expect(useEditorStore.getState().isDirty).toBe(false);
    });

    it('should add a code node now that the sandboxed executor is shipped', () => {
      useEditorStore.getState().addNode(NodeType.CODE, { x: 0, y: 0 });
      expect(useEditorStore.getState().nodes).toHaveLength(1);
      expect(useEditorStore.getState().nodes[0].data.nodeType).toBe(NodeType.CODE);
      expect(useEditorStore.getState().isDirty).toBe(true);
    });

    it('should refuse to add a second trigger when one already exists', () => {
      const { addNode } = useEditorStore.getState();
      addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      expect(useEditorStore.getState().nodes).toHaveLength(1);

      addNode(NodeType.CRON_TRIGGER, { x: 50, y: 50 });

      const nodes = useEditorStore.getState().nodes;
      expect(nodes).toHaveLength(1);
      expect(nodes[0].data.nodeType).toBe(NodeType.MANUAL_TRIGGER);
    });

    it('should allow adding a trigger after the existing one is deleted', () => {
      const { addNode, onNodesChange, deleteSelected } = useEditorStore.getState();
      addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      const id = useEditorStore.getState().nodes[0].id;
      onNodesChange([{ id, type: 'select', selected: true }]);
      deleteSelected();
      expect(useEditorStore.getState().nodes).toHaveLength(0);

      addNode(NodeType.CRON_TRIGGER, { x: 0, y: 0 });

      expect(useEditorStore.getState().nodes).toHaveLength(1);
      expect(useEditorStore.getState().nodes[0].data.nodeType).toBe(NodeType.CRON_TRIGGER);
    });

    it('should create a sticky node with React Flow type="sticky" and default config', () => {
      useEditorStore.getState().addNode(NodeType.STICKY, { x: 50, y: 60 });

      const { nodes } = useEditorStore.getState();
      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toMatchObject({
        type: 'sticky',
        position: { x: 50, y: 60 },
        data: {
          nodeType: NodeType.STICKY,
          config: {
            text: '',
            color: 'yellow',
            width: 220,
            height: 140,
          },
        },
      });
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

    it('should not dirty the store on a select-only change', () => {
      const { addNode, onNodesChange } = useEditorStore.getState();
      addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      const nodeId = useEditorStore.getState().nodes[0].id;

      useEditorStore.setState({ isDirty: false });
      onNodesChange([{ id: nodeId, type: 'select', selected: true }]);

      expect(useEditorStore.getState().isDirty).toBe(false);
    });

    it('should not dirty the store on a dimensions change (React Flow auto-measure)', () => {
      const { addNode, onNodesChange } = useEditorStore.getState();
      addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      const nodeId = useEditorStore.getState().nodes[0].id;

      useEditorStore.setState({ isDirty: false });
      onNodesChange([{ id: nodeId, type: 'dimensions', dimensions: { width: 100, height: 60 } }]);

      expect(useEditorStore.getState().isDirty).toBe(false);
    });

    it('should not dirty the store while dragging (only on drop-release)', () => {
      const { addNode, onNodesChange } = useEditorStore.getState();
      addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      const nodeId = useEditorStore.getState().nodes[0].id;
      useEditorStore.setState({ isDirty: false });

      onNodesChange([{ id: nodeId, type: 'position', position: { x: 5, y: 5 }, dragging: true }]);
      expect(useEditorStore.getState().isDirty).toBe(false);

      onNodesChange([{ id: nodeId, type: 'position', position: { x: 5, y: 5 }, dragging: false }]);
      expect(useEditorStore.getState().isDirty).toBe(true);
    });

    it('should not dirty the store on a no-op click (drop at the same position)', () => {
      const { addNode, onNodesChange } = useEditorStore.getState();
      addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      const nodeId = useEditorStore.getState().nodes[0].id;
      useEditorStore.setState({ isDirty: false });

      // React Flow emits a final position change with dragging:false even on a
      // plain click. Same coordinates → nothing actually moved → stay clean.
      onNodesChange([{ id: nodeId, type: 'position', position: { x: 0, y: 0 }, dragging: false }]);

      expect(useEditorStore.getState().isDirty).toBe(false);
    });

    it('should not dirty the store on a click reported as drag start+stop in place', () => {
      const { addNode, onNodesChange } = useEditorStore.getState();
      addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      const nodeId = useEditorStore.getState().nodes[0].id;
      useEditorStore.setState({ isDirty: false });

      onNodesChange([{ id: nodeId, type: 'position', position: { x: 0, y: 0 }, dragging: true }]);
      onNodesChange([{ id: nodeId, type: 'position', position: { x: 0, y: 0 }, dragging: false }]);

      expect(useEditorStore.getState().isDirty).toBe(false);
    });
  });

  describe('onEdgesChange', () => {
    it('should not dirty the store on a select-only edge change', () => {
      const { addNode, onConnect, onEdgesChange } = useEditorStore.getState();
      addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      addNode(NodeType.HTTP_REQUEST, { x: 200, y: 0 });
      const [source, target] = useEditorStore.getState().nodes;
      onConnect({ source: source.id, target: target.id, sourceHandle: null, targetHandle: null });
      const edgeId = useEditorStore.getState().edges[0].id;

      useEditorStore.setState({ isDirty: false });
      onEdgesChange([{ id: edgeId, type: 'select', selected: true }]);

      expect(useEditorStore.getState().isDirty).toBe(false);
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

    it('should tag the edge data with kind:error when sourceHandle is "error"', () => {
      const { addNode, onConnect } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      addNode(NodeType.HTTP_REQUEST, { x: 200, y: 0 });
      const [source, target] = useEditorStore.getState().nodes;

      onConnect({
        source: source.id,
        target: target.id,
        sourceHandle: 'error',
        targetHandle: null,
      });

      const { edges } = useEditorStore.getState();
      expect(edges).toHaveLength(1);
      expect(edges[0].sourceHandle).toBe('error');
      expect(edges[0].data).toMatchObject({ kind: 'error' });
    });

    it('should not tag a kind on edges with no sourceHandle (default success)', () => {
      const { addNode, onConnect } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      addNode(NodeType.HTTP_REQUEST, { x: 200, y: 0 });
      const [source, target] = useEditorStore.getState().nodes;

      onConnect({
        source: source.id,
        target: target.id,
        sourceHandle: null,
        targetHandle: null,
      });

      const { edges } = useEditorStore.getState();
      const kind = (edges[0].data as { kind?: string } | undefined)?.kind;
      expect(kind).toBeUndefined();
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

  describe('toggleNodeSkip', () => {
    it('should flip an unset skipped flag to true and mark the store dirty', () => {
      const { addNode, toggleNodeSkip } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      const nodeId = useEditorStore.getState().nodes[0].id;
      useEditorStore.setState({ isDirty: false });

      toggleNodeSkip(nodeId);

      expect(useEditorStore.getState().nodes[0].data.skipped).toBe(true);
      expect(useEditorStore.getState().isDirty).toBe(true);
    });

    it('should flip skipped back to false on a second call', () => {
      const { addNode, toggleNodeSkip } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      const nodeId = useEditorStore.getState().nodes[0].id;

      toggleNodeSkip(nodeId);
      toggleNodeSkip(nodeId);

      expect(useEditorStore.getState().nodes[0].data.skipped).toBe(false);
    });

    it('should push a snapshot to past so undo restores the previous skipped state', () => {
      const { addNode, toggleNodeSkip, undo } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      const nodeId = useEditorStore.getState().nodes[0].id;

      toggleNodeSkip(nodeId);
      expect(useEditorStore.getState().nodes[0].data.skipped).toBe(true);

      undo();
      expect(useEditorStore.getState().nodes[0].data.skipped).toBeFalsy();
    });

    it('should be a no-op when the target node id does not exist', () => {
      const { addNode, toggleNodeSkip } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      useEditorStore.setState({ isDirty: false });
      const snapshot = useEditorStore.getState().nodes;

      toggleNodeSkip('node-does-not-exist');

      expect(useEditorStore.getState().nodes).toEqual(snapshot);
      expect(useEditorStore.getState().isDirty).toBe(false);
    });
  });

  describe('loadWorkflow', () => {
    it('should default entryRoute to null when no entryRoute is supplied', () => {
      useEditorStore.getState().loadWorkflow({
        id: 'wf-1',
        definition: { nodes: [], edges: [] },
      });
      expect(useEditorStore.getState().entryRoute).toBeNull();
    });

    it('should store the supplied entryRoute', () => {
      useEditorStore.getState().loadWorkflow({
        id: 'wf-1',
        definition: { nodes: [], edges: [] },
        entryRoute: '/dashboard',
      });
      expect(useEditorStore.getState().entryRoute).toBe('/dashboard');
    });

    it('should overwrite a previously stored entryRoute on subsequent loads', () => {
      useEditorStore.setState({ entryRoute: '/library' });
      useEditorStore.getState().loadWorkflow({
        id: 'wf-1',
        definition: { nodes: [], edges: [] },
        entryRoute: '/dashboard',
      });
      expect(useEditorStore.getState().entryRoute).toBe('/dashboard');
    });
  });

  describe('resetEditor', () => {
    it('should clear entryRoute back to null', () => {
      useEditorStore.setState({ entryRoute: '/dashboard' });
      useEditorStore.getState().resetEditor();
      expect(useEditorStore.getState().entryRoute).toBeNull();
    });

    it('should reset viewMode back to configure', () => {
      useEditorStore.setState({ viewMode: 'result' });
      useEditorStore.getState().resetEditor();
      expect(useEditorStore.getState().viewMode).toBe('configure');
    });
  });

  describe('viewMode', () => {
    it('should default to configure', () => {
      expect(useEditorStore.getState().viewMode).toBe('configure');
    });

    it('should switch to result via setViewMode', () => {
      useEditorStore.getState().setViewMode('result');
      expect(useEditorStore.getState().viewMode).toBe('result');
    });

    it('should switch back to configure via setViewMode', () => {
      useEditorStore.setState({ viewMode: 'result' });
      useEditorStore.getState().setViewMode('configure');
      expect(useEditorStore.getState().viewMode).toBe('configure');
    });

    it('should not be flipped to result by loadWorkflow', () => {
      useEditorStore.getState().loadWorkflow({ id: 'wf-1', definition: { nodes: [], edges: [] } });
      expect(useEditorStore.getState().viewMode).toBe('configure');
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

  describe('deleteSelected', () => {
    it('should remove every selected node', () => {
      const { addNode, onNodesChange, deleteSelected } = useEditorStore.getState();
      addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      addNode(NodeType.HTTP_REQUEST, { x: 100, y: 0 });
      const [first, second] = useEditorStore.getState().nodes;
      onNodesChange([{ id: first.id, type: 'select', selected: true }]);

      deleteSelected();

      const remaining = useEditorStore.getState().nodes;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(second.id);
    });

    it('should drop edges that lose an endpoint after deletion', () => {
      const { addNode, onNodesChange, onConnect, deleteSelected } = useEditorStore.getState();
      addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      addNode(NodeType.HTTP_REQUEST, { x: 100, y: 0 });
      const [source, target] = useEditorStore.getState().nodes;
      onConnect({
        source: source.id,
        target: target.id,
        sourceHandle: null,
        targetHandle: null,
      });
      onNodesChange([{ id: source.id, type: 'select', selected: true }]);

      deleteSelected();

      expect(useEditorStore.getState().edges).toHaveLength(0);
    });

    it('should be a no-op when nothing is selected', () => {
      const { addNode, deleteSelected } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      useEditorStore.setState({ isDirty: false });
      const before = useEditorStore.getState().nodes;

      deleteSelected();

      expect(useEditorStore.getState().nodes).toEqual(before);
      expect(useEditorStore.getState().isDirty).toBe(false);
    });

    it('should remove a selected edge while leaving its endpoint nodes intact', () => {
      const { addNode, onConnect, onEdgesChange, deleteSelected } = useEditorStore.getState();
      addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      addNode(NodeType.HTTP_REQUEST, { x: 100, y: 0 });
      const [source, target] = useEditorStore.getState().nodes;
      onConnect({
        source: source.id,
        target: target.id,
        sourceHandle: null,
        targetHandle: null,
      });
      const edgeId = useEditorStore.getState().edges[0].id;
      onEdgesChange([{ id: edgeId, type: 'select', selected: true }]);
      useEditorStore.setState({ isDirty: false });
      const pastBefore = useEditorStore.getState().past.length;

      deleteSelected();

      expect(useEditorStore.getState().edges).toHaveLength(0);
      expect(useEditorStore.getState().nodes).toHaveLength(2);
      expect(useEditorStore.getState().isDirty).toBe(true);
      expect(useEditorStore.getState().past.length).toBe(pastBefore + 1);
    });
  });

  describe('duplicateSelected', () => {
    it('should append a copy of every selected non-trigger node with fresh ids', () => {
      const { addNode, onNodesChange, duplicateSelected } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      addNode(NodeType.CONDITIONAL, { x: 100, y: 0 });
      const originalIds = useEditorStore.getState().nodes.map((n) => n.id);
      onNodesChange(originalIds.map((id) => ({ id, type: 'select', selected: true })));

      duplicateSelected();

      const all = useEditorStore.getState().nodes;
      expect(all).toHaveLength(4);
      const newOnes = all.filter((n) => !originalIds.includes(n.id));
      expect(newOnes).toHaveLength(2);
      newOnes.forEach((n) => expect(n.id).toMatch(/^node-/));
    });

    it('should also copy inter-edges between selected nodes', () => {
      const { addNode, onNodesChange, onConnect, duplicateSelected } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      addNode(NodeType.CONDITIONAL, { x: 100, y: 0 });
      const [source, target] = useEditorStore.getState().nodes;
      onConnect({
        source: source.id,
        target: target.id,
        sourceHandle: null,
        targetHandle: null,
      });
      onNodesChange([
        { id: source.id, type: 'select', selected: true },
        { id: target.id, type: 'select', selected: true },
      ]);

      duplicateSelected();

      expect(useEditorStore.getState().edges).toHaveLength(2);
    });

    it('should strip trigger duplicates when the workflow already has a trigger', () => {
      const { addNode, onNodesChange, duplicateSelected } = useEditorStore.getState();
      addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      const triggerId = useEditorStore.getState().nodes[0].id;
      onNodesChange([{ id: triggerId, type: 'select', selected: true }]);

      const created = duplicateSelected();

      expect(created).toEqual([]);
      expect(useEditorStore.getState().nodes).toHaveLength(1);
    });

    it('should select only the freshly duplicated nodes', () => {
      const { addNode, onNodesChange, duplicateSelected } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      const originalId = useEditorStore.getState().nodes[0].id;
      onNodesChange([{ id: originalId, type: 'select', selected: true }]);

      duplicateSelected();

      const all = useEditorStore.getState().nodes;
      const original = all.find((n) => n.id === originalId);
      const duplicated = all.find((n) => n.id !== originalId);
      expect(original?.selected).toBeFalsy();
      expect(duplicated?.selected).toBe(true);
    });

    it('should be a no-op when no nodes are selected', () => {
      const { addNode, duplicateSelected } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      useEditorStore.setState({ isDirty: false });
      const before = useEditorStore.getState().nodes;

      duplicateSelected();

      expect(useEditorStore.getState().nodes).toEqual(before);
      expect(useEditorStore.getState().isDirty).toBe(false);
    });

    it('should push an undo snapshot so the duplicate can be reverted', () => {
      const { addNode, onNodesChange, duplicateSelected, undo } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      const originalId = useEditorStore.getState().nodes[0].id;
      onNodesChange([{ id: originalId, type: 'select', selected: true }]);

      duplicateSelected();
      expect(useEditorStore.getState().nodes).toHaveLength(2);

      undo();
      expect(useEditorStore.getState().nodes).toHaveLength(1);
    });
  });

  describe('toggleSkipOnSelected', () => {
    it('should flip skipped on every selected non-trigger node', () => {
      const { addNode, onNodesChange, toggleSkipOnSelected } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      addNode(NodeType.CONDITIONAL, { x: 100, y: 0 });
      const ids = useEditorStore.getState().nodes.map((n) => n.id);
      onNodesChange(ids.map((id) => ({ id, type: 'select', selected: true })));

      toggleSkipOnSelected();

      useEditorStore.getState().nodes.forEach((n) => {
        expect(n.data.skipped).toBe(true);
      });
    });

    it('should leave unselected nodes untouched', () => {
      const { addNode, onNodesChange, toggleSkipOnSelected } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      addNode(NodeType.CONDITIONAL, { x: 100, y: 0 });
      const [first, second] = useEditorStore.getState().nodes;
      onNodesChange([{ id: first.id, type: 'select', selected: true }]);

      toggleSkipOnSelected();

      const after = useEditorStore.getState().nodes;
      expect(after.find((n) => n.id === first.id)?.data.skipped).toBe(true);
      expect(after.find((n) => n.id === second.id)?.data.skipped).toBeFalsy();
    });

    it('should not toggle skip on trigger nodes even when selected', () => {
      const { addNode, onNodesChange, toggleSkipOnSelected } = useEditorStore.getState();
      addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      addNode(NodeType.HTTP_REQUEST, { x: 100, y: 0 });
      const [trigger, action] = useEditorStore.getState().nodes;
      onNodesChange([
        { id: trigger.id, type: 'select', selected: true },
        { id: action.id, type: 'select', selected: true },
      ]);

      toggleSkipOnSelected();

      const after = useEditorStore.getState().nodes;
      expect(after.find((n) => n.id === trigger.id)?.data.skipped).toBeFalsy();
      expect(after.find((n) => n.id === action.id)?.data.skipped).toBe(true);
    });

    it('should flip skipped back to false on a second call (idempotent toggle)', () => {
      const { addNode, onNodesChange, toggleSkipOnSelected } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      const id = useEditorStore.getState().nodes[0].id;
      onNodesChange([{ id, type: 'select', selected: true }]);

      toggleSkipOnSelected();
      toggleSkipOnSelected();

      expect(useEditorStore.getState().nodes[0].data.skipped).toBe(false);
    });

    it('should be a no-op when no nodes are selected', () => {
      const { addNode, toggleSkipOnSelected } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      useEditorStore.setState({ isDirty: false });
      const before = useEditorStore.getState().nodes;

      toggleSkipOnSelected();

      expect(useEditorStore.getState().nodes).toEqual(before);
      expect(useEditorStore.getState().isDirty).toBe(false);
    });

    it('should push exactly one undo snapshot for an atomic multi-node toggle', () => {
      const { addNode, onNodesChange, toggleSkipOnSelected } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      addNode(NodeType.CONDITIONAL, { x: 100, y: 0 });
      const ids = useEditorStore.getState().nodes.map((n) => n.id);
      onNodesChange(ids.map((id) => ({ id, type: 'select', selected: true })));
      const pastBefore = useEditorStore.getState().past.length;

      toggleSkipOnSelected();

      expect(useEditorStore.getState().past.length).toBe(pastBefore + 1);
    });
  });

  describe('pasteFromClipboardPayload', () => {
    const buildPayloadFromCurrent = (): ClipboardPayload => {
      const { nodes, edges } = useEditorStore.getState();
      return buildClipboardPayload(nodes, edges);
    };

    it('should append the pasted nodes onto the current node list', () => {
      const { addNode } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      const payload = buildPayloadFromCurrent();

      useEditorStore.getState().pasteFromClipboardPayload(payload);

      expect(useEditorStore.getState().nodes).toHaveLength(2);
    });

    it('should return the array of new node ids', () => {
      const { addNode } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      addNode(NodeType.CONDITIONAL, { x: 100, y: 0 });
      const payload = buildPayloadFromCurrent();

      const ids = useEditorStore.getState().pasteFromClipboardPayload(payload);

      expect(ids).toHaveLength(2);
      ids.forEach((id) => expect(id).toMatch(/^node-/));
    });

    it('should strip trigger nodes from the payload when one trigger already exists', () => {
      const { addNode } = useEditorStore.getState();
      addNode(NodeType.MANUAL_TRIGGER, { x: 0, y: 0 });
      addNode(NodeType.HTTP_REQUEST, { x: 100, y: 0 });
      const payload = buildPayloadFromCurrent();

      // Reset to a workflow that already has a trigger so the paste re-runs
      // against state with a trigger present.
      const ids = useEditorStore.getState().pasteFromClipboardPayload(payload);

      // Trigger from the payload is dropped; only the HTTP_REQUEST is pasted.
      expect(ids).toHaveLength(1);
      const nodeTypesAfter = useEditorStore.getState().nodes.map((n) => n.data.nodeType);
      const triggerCount = nodeTypesAfter.filter(
        (t) => t === NodeType.MANUAL_TRIGGER || t === NodeType.CRON_TRIGGER,
      ).length;
      expect(triggerCount).toBe(1);
    });

    it('should set isDirty: true (AC #9)', () => {
      const { addNode } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      const payload = buildPayloadFromCurrent();
      useEditorStore.setState({ isDirty: false });

      useEditorStore.getState().pasteFromClipboardPayload(payload);

      expect(useEditorStore.getState().isDirty).toBe(true);
    });

    it('should push an undo snapshot so the paste can be reverted', () => {
      const { addNode } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      const payload = buildPayloadFromCurrent();
      const before = useEditorStore.getState().nodes.length;

      useEditorStore.getState().pasteFromClipboardPayload(payload);
      expect(useEditorStore.getState().nodes.length).toBe(before + 1);

      useEditorStore.getState().undo();
      expect(useEditorStore.getState().nodes.length).toBe(before);
    });

    it('should generate ids that do not collide with existing nodes (AC #3)', () => {
      const { addNode } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      const original = useEditorStore.getState().nodes[0];
      const payload = buildClipboardPayload([original], []);

      useEditorStore.getState().pasteFromClipboardPayload(payload);
      useEditorStore.getState().pasteFromClipboardPayload(payload);

      const ids = useEditorStore.getState().nodes.map((n) => n.id);
      expect(ids.length).toBe(3);
      expect(new Set(ids).size).toBe(3);
    });

    it('should append correctly after loadWorkflow into a different workflow (AC #6)', () => {
      const { addNode } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      addNode(NodeType.CRON_TRIGGER, { x: 100, y: 0 });
      const payload = buildPayloadFromCurrent();

      useEditorStore.getState().loadWorkflow({
        id: 'wf-other',
        definition: { nodes: [], edges: [] },
      });
      expect(useEditorStore.getState().nodes).toHaveLength(0);

      useEditorStore.getState().pasteFromClipboardPayload(payload);

      expect(useEditorStore.getState().workflowId).toBe('wf-other');
      expect(useEditorStore.getState().nodes).toHaveLength(2);
    });

    it('should deselect existing nodes and select the freshly pasted ones', () => {
      const { addNode, onNodesChange } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      const existingId = useEditorStore.getState().nodes[0].id;
      // mark the existing node as React-Flow-selected
      onNodesChange([{ id: existingId, type: 'select', selected: true }]);
      const payload = buildClipboardPayload(
        useEditorStore.getState().nodes,
        useEditorStore.getState().edges,
      );

      const newIds = useEditorStore.getState().pasteFromClipboardPayload(payload);

      const all = useEditorStore.getState().nodes;
      const existing = all.find((n) => n.id === existingId);
      const pasted = all.filter((n) => newIds.includes(n.id));
      expect(existing?.selected).toBeFalsy();
      expect(pasted.every((n) => n.selected === true)).toBe(true);
    });

    it('should be a no-op when the payload contains no nodes', () => {
      const empty: ClipboardPayload = {
        tietideClipboard: CLIPBOARD_VERSION,
        nodes: [],
        edges: [],
      };
      const before = { ...useEditorStore.getState() };

      const ids = useEditorStore.getState().pasteFromClipboardPayload(empty);

      expect(ids).toEqual([]);
      expect(useEditorStore.getState().nodes).toEqual(before.nodes);
      expect(useEditorStore.getState().isDirty).toBe(false);
    });
  });

  describe('activePillField', () => {
    it('defaults to null', () => {
      expect(useEditorStore.getState().activePillField).toBeNull();
    });

    it('sets and clears the active pill field', () => {
      const insert = () => {};
      useEditorStore.getState().setActivePillField({ nodeId: 'node-1', insert });
      expect(useEditorStore.getState().activePillField).toEqual({ nodeId: 'node-1', insert });

      useEditorStore.getState().setActivePillField(null);
      expect(useEditorStore.getState().activePillField).toBeNull();
    });

    it('is transient: not captured by undo history and untouched by undo/redo', () => {
      const { addNode, setActivePillField, undo, redo } = useEditorStore.getState();
      addNode(NodeType.HTTP_REQUEST, { x: 0, y: 0 });
      const insert = () => {};
      setActivePillField({ nodeId: 'node-1', insert });

      undo();
      // undo rewinds nodes but leaves the transient active field in place
      expect(useEditorStore.getState().nodes).toHaveLength(0);
      expect(useEditorStore.getState().activePillField).toEqual({ nodeId: 'node-1', insert });

      redo();
      expect(useEditorStore.getState().nodes).toHaveLength(1);
      expect(useEditorStore.getState().activePillField).toEqual({ nodeId: 'node-1', insert });
    });

    it('clears when a workflow is loaded', () => {
      useEditorStore.getState().setActivePillField({ nodeId: 'node-1', insert: () => {} });
      useEditorStore.getState().loadWorkflow({
        id: 'wf-1',
        definition: { nodes: [], edges: [] },
      });
      expect(useEditorStore.getState().activePillField).toBeNull();
    });
  });
});
