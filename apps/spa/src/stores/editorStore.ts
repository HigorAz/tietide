import { create } from 'zustand';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type XYPosition,
} from 'reactflow';
import { NODE_CATALOG, type NodeType, type WorkflowDefinition } from '@tietide/shared';
import type { CustomNodeData } from '@/components/editor/nodes/CustomNode.types';
import { fromWorkflowDefinition } from '@/components/editor/serialization';

const HISTORY_LIMIT = 50;

export interface EditorSnapshot {
  nodes: Node<CustomNodeData>[];
  edges: Edge[];
}

export interface EditorState {
  workflowId: string | null;
  nodes: Node<CustomNodeData>[];
  edges: Edge[];
  isDirty: boolean;
  selectedNodeId: string | null;
  past: EditorSnapshot[];
  future: EditorSnapshot[];
}

export interface EditorActions {
  addNode: (nodeType: NodeType, position: XYPosition) => void;
  setNodes: (nodes: Node<CustomNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  selectNode: (id: string | null) => void;
  updateNodeConfig: (id: string, patch: Record<string, unknown>) => void;
  undo: () => void;
  redo: () => void;
  loadWorkflow: (payload: { id: string; definition: WorkflowDefinition }) => void;
  markSaved: () => void;
  resetEditor: () => void;
}

export type EditorStore = EditorState & EditorActions;

export const initialEditorState: EditorState = {
  workflowId: null,
  nodes: [],
  edges: [],
  isDirty: false,
  selectedNodeId: null,
  past: [],
  future: [],
};

const generateNodeId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `node-${crypto.randomUUID()}`;
  }
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const pushSnapshot = (past: EditorSnapshot[], snapshot: EditorSnapshot): EditorSnapshot[] => {
  const next = [...past, snapshot];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
};

const nodeChangeSnapshots = (changes: NodeChange[]): boolean =>
  changes.some((c) => c.type === 'remove' || (c.type === 'position' && c.dragging === false));

const edgeChangeSnapshots = (changes: EdgeChange[]): boolean =>
  changes.some((c) => c.type === 'remove');

export const useEditorStore = create<EditorStore>((set, get) => {
  const commit = (patch: Partial<EditorState>): void => {
    const { nodes, edges } = get();
    set((s) => ({
      ...patch,
      past: pushSnapshot(s.past, { nodes, edges }),
      future: [],
      isDirty: true,
    }));
  };

  return {
    ...initialEditorState,

    addNode: (nodeType, position) => {
      const def = NODE_CATALOG.find((d) => d.type === nodeType);
      if (!def) return;

      const newNode: Node<CustomNodeData> = {
        id: generateNodeId(),
        type: 'custom',
        position,
        data: {
          label: def.name,
          description: def.description,
          nodeType: def.type,
          status: 'idle',
          config: {},
        },
      };

      commit({ nodes: [...get().nodes, newNode] });
    },

    setNodes: (nodes) => commit({ nodes }),
    setEdges: (edges) => commit({ edges }),

    onNodesChange: (changes) => {
      const prev = get();
      const nextNodes = applyNodeChanges(changes, prev.nodes) as Node<CustomNodeData>[];
      const selectionRemoved =
        prev.selectedNodeId !== null &&
        changes.some((change) => change.type === 'remove' && change.id === prev.selectedNodeId);
      const nextSelection = selectionRemoved ? null : prev.selectedNodeId;

      if (nodeChangeSnapshots(changes)) {
        set({
          nodes: nextNodes,
          selectedNodeId: nextSelection,
          past: pushSnapshot(prev.past, { nodes: prev.nodes, edges: prev.edges }),
          future: [],
          isDirty: true,
        });
        return;
      }

      set({
        nodes: nextNodes,
        selectedNodeId: nextSelection,
        isDirty: true,
      });
    },

    onEdgesChange: (changes) => {
      const prev = get();
      const nextEdges = applyEdgeChanges(changes, prev.edges);

      if (edgeChangeSnapshots(changes)) {
        set({
          edges: nextEdges,
          past: pushSnapshot(prev.past, { nodes: prev.nodes, edges: prev.edges }),
          future: [],
          isDirty: true,
        });
        return;
      }

      set({ edges: nextEdges, isDirty: true });
    },

    onConnect: (connection) => {
      const prev = get();
      commit({ edges: addEdge({ ...connection, type: 'livingInk' }, prev.edges) });
    },

    selectNode: (id) => set({ selectedNodeId: id }),

    updateNodeConfig: (id, patch) => {
      const { nodes } = get();
      const index = nodes.findIndex((n) => n.id === id);
      if (index === -1) return;

      const current = nodes[index];
      const nextConfig = { ...(current.data.config ?? {}), ...patch };
      const nextNode: Node<CustomNodeData> = {
        ...current,
        data: { ...current.data, config: nextConfig },
      };
      const nextNodes = [...nodes];
      nextNodes[index] = nextNode;
      commit({ nodes: nextNodes });
    },

    undo: () => {
      const { past, future, nodes, edges } = get();
      if (past.length === 0) return;
      const previous = past[past.length - 1];
      const nextPast = past.slice(0, -1);
      set({
        nodes: previous.nodes,
        edges: previous.edges,
        past: nextPast,
        future: [...future, { nodes, edges }],
        isDirty: true,
      });
    },

    redo: () => {
      const { past, future, nodes, edges } = get();
      if (future.length === 0) return;
      const next = future[future.length - 1];
      const nextFuture = future.slice(0, -1);
      set({
        nodes: next.nodes,
        edges: next.edges,
        past: [...past, { nodes, edges }],
        future: nextFuture,
        isDirty: true,
      });
    },

    loadWorkflow: ({ id, definition }) => {
      const { nodes, edges } = fromWorkflowDefinition(definition);
      set({
        workflowId: id,
        nodes,
        edges,
        isDirty: false,
        selectedNodeId: null,
        past: [],
        future: [],
      });
    },

    markSaved: () => set({ isDirty: false }),

    resetEditor: () => set({ ...initialEditorState }),
  };
});
