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
}

export interface EditorActions {
  addNode: (nodeType: NodeType, position: XYPosition) => void;
  setNodes: (nodes: Node<CustomNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
}

export type EditorStore = EditorState & EditorActions;

export const initialEditorState: EditorState = {
  nodes: [],
  edges: [],
  isDirty: false,
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
      },
    };

    set({ nodes: [...get().nodes, newNode], isDirty: true });
  },

  setNodes: (nodes) => set({ nodes, isDirty: true }),
  setEdges: (edges) => set({ edges, isDirty: true }),

  onNodesChange: (changes) =>
    set({
      nodes: applyNodeChanges(changes, get().nodes) as Node<CustomNodeData>[],
      isDirty: true,
    }),
  onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges), isDirty: true }),
  onConnect: (connection) =>
    set({
      edges: addEdge({ ...connection, type: 'livingInk' }, get().edges),
      isDirty: true,
    }),
}));
