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
import { NODE_CATALOG, type NodeType } from '@tietide/shared';
import type { CustomNodeData } from '@/components/editor/nodes/CustomNode.types';

export interface EditorState {
  nodes: Node<CustomNodeData>[];
  edges: Edge[];
  isDirty: boolean;
  selectedNodeId: string | null;
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
}

export type EditorStore = EditorState & EditorActions;

export const initialEditorState: EditorState = {
  nodes: [],
  edges: [],
  isDirty: false,
  selectedNodeId: null,
};

const generateNodeId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `node-${crypto.randomUUID()}`;
  }
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const useEditorStore = create<EditorStore>((set, get) => ({
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

    set({ nodes: [...get().nodes, newNode], isDirty: true });
  },

  setNodes: (nodes) => set({ nodes, isDirty: true }),
  setEdges: (edges) => set({ edges, isDirty: true }),

  onNodesChange: (changes) => {
    const nextNodes = applyNodeChanges(changes, get().nodes) as Node<CustomNodeData>[];
    const { selectedNodeId } = get();
    const selectionRemoved =
      selectedNodeId !== null &&
      changes.some((change) => change.type === 'remove' && change.id === selectedNodeId);

    set({
      nodes: nextNodes,
      isDirty: true,
      selectedNodeId: selectionRemoved ? null : selectedNodeId,
    });
  },
  onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges), isDirty: true }),
  onConnect: (connection) =>
    set({
      edges: addEdge({ ...connection, type: 'livingInk' }, get().edges),
      isDirty: true,
    }),

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
    set({ nodes: nextNodes, isDirty: true });
  },
}));
