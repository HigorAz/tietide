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
import {
  FORBIDDEN_NODE_TYPES,
  NODE_CATALOG,
  NodeCategory,
  NodeType,
  STICKY_DEFAULT_HEIGHT,
  STICKY_DEFAULT_WIDTH,
  type WorkflowDefinition,
} from '@tietide/shared';
import type { CustomNodeData } from '@/components/editor/nodes/CustomNode.types';
import { fromWorkflowDefinition } from '@/components/editor/serialization';
import { buildClipboardPayload, remapClipboardIds, type ClipboardPayload } from '@/lib/clipboard';

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
  entryRoute: string | null;
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
  toggleNodeSkip: (id: string) => void;
  toggleSkipOnSelected: () => void;
  deleteSelected: () => void;
  duplicateSelected: () => string[];
  pasteFromClipboardPayload: (payload: ClipboardPayload) => string[];
  undo: () => void;
  redo: () => void;
  loadWorkflow: (payload: {
    id: string;
    definition: WorkflowDefinition;
    entryRoute?: string;
  }) => void;
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
  entryRoute: null,
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
      if (FORBIDDEN_NODE_TYPES.has(nodeType)) return;
      const def = NODE_CATALOG.find((d) => d.type === nodeType);
      if (!def) return;

      if (def.category === NodeCategory.TRIGGER) {
        const hasTrigger = get().nodes.some((n) => {
          const cat = NODE_CATALOG.find((d) => d.type === n.data.nodeType)?.category;
          return cat === NodeCategory.TRIGGER;
        });
        if (hasTrigger) return;
      }

      const isSticky = nodeType === NodeType.STICKY;
      const newNode: Node<CustomNodeData> = {
        id: generateNodeId(),
        type: isSticky ? 'sticky' : 'custom',
        position,
        data: {
          label: def.name,
          description: def.description,
          nodeType: def.type,
          status: 'idle',
          config: isSticky
            ? {
                text: '',
                color: 'yellow',
                width: STICKY_DEFAULT_WIDTH,
                height: STICKY_DEFAULT_HEIGHT,
              }
            : {},
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
      const isErrorEdge = connection.sourceHandle === 'error';
      const newEdge: Edge = {
        ...connection,
        type: 'livingInk',
        ...(isErrorEdge ? { data: { kind: 'error' as const } } : {}),
      } as Edge;
      commit({ edges: addEdge(newEdge, prev.edges) });
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

    toggleNodeSkip: (id) => {
      const { nodes } = get();
      const index = nodes.findIndex((n) => n.id === id);
      if (index === -1) return;

      const current = nodes[index];
      const nextNode: Node<CustomNodeData> = {
        ...current,
        data: { ...current.data, skipped: !current.data.skipped },
      };
      const nextNodes = [...nodes];
      nextNodes[index] = nextNode;
      commit({ nodes: nextNodes });
    },

    toggleSkipOnSelected: () => {
      const { nodes } = get();
      const targets = nodes.filter((n) => {
        if (n.selected !== true) return false;
        const cat = NODE_CATALOG.find((d) => d.type === n.data.nodeType)?.category;
        return cat !== NodeCategory.TRIGGER;
      });
      if (targets.length === 0) return;

      const targetIds = new Set(targets.map((n) => n.id));
      const nextNodes = nodes.map((n) =>
        targetIds.has(n.id) ? { ...n, data: { ...n.data, skipped: !n.data.skipped } } : n,
      );
      commit({ nodes: nextNodes });
    },

    deleteSelected: () => {
      const prev = get();
      const removedIds = new Set(prev.nodes.filter((n) => n.selected === true).map((n) => n.id));
      if (removedIds.size === 0) return;

      const nextNodes = prev.nodes.filter((n) => !removedIds.has(n.id));
      const nextEdges = prev.edges.filter(
        (e) => !removedIds.has(e.source) && !removedIds.has(e.target),
      );
      const nextSelection =
        prev.selectedNodeId !== null && removedIds.has(prev.selectedNodeId)
          ? null
          : prev.selectedNodeId;

      set({
        nodes: nextNodes,
        edges: nextEdges,
        selectedNodeId: nextSelection,
        past: pushSnapshot(prev.past, { nodes: prev.nodes, edges: prev.edges }),
        future: [],
        isDirty: true,
      });
    },

    duplicateSelected: () => {
      const prev = get();
      const selected = prev.nodes.filter((n) => n.selected === true);
      if (selected.length === 0) return [];
      const payload = buildClipboardPayload(selected, prev.edges);
      return get().pasteFromClipboardPayload(payload);
    },

    pasteFromClipboardPayload: (payload) => {
      const prev = get();

      const isTriggerType = (nodeType: string): boolean => {
        return NODE_CATALOG.find((d) => d.type === nodeType)?.category === NodeCategory.TRIGGER;
      };
      const hasTrigger = prev.nodes.some((n) => isTriggerType(n.data.nodeType));

      let filteredPayload = payload;
      if (hasTrigger) {
        const droppedIds = new Set(
          payload.nodes.filter((n) => isTriggerType(n.data.nodeType)).map((n) => n.id),
        );
        if (droppedIds.size > 0) {
          filteredPayload = {
            ...payload,
            nodes: payload.nodes.filter((n) => !droppedIds.has(n.id)),
            edges: payload.edges.filter(
              (e) => !droppedIds.has(e.source) && !droppedIds.has(e.target),
            ),
          };
        }
      }

      const { nodes: newNodes, edges: newEdges } = remapClipboardIds(filteredPayload);
      if (newNodes.length === 0) return [];

      const deselected = prev.nodes.map((n) => (n.selected ? { ...n, selected: false } : n));
      const selectedNew = newNodes.map((n) => ({ ...n, selected: true }));

      set({
        nodes: [...deselected, ...selectedNew],
        edges: [...prev.edges, ...newEdges],
        past: pushSnapshot(prev.past, { nodes: prev.nodes, edges: prev.edges }),
        future: [],
        isDirty: true,
        selectedNodeId: selectedNew.length === 1 ? selectedNew[0].id : null,
      });

      return selectedNew.map((n) => n.id);
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

    loadWorkflow: ({ id, definition, entryRoute }) => {
      const { nodes, edges } = fromWorkflowDefinition(definition);
      set({
        workflowId: id,
        nodes,
        edges,
        isDirty: false,
        selectedNodeId: null,
        past: [],
        future: [],
        entryRoute: entryRoute ?? null,
      });
    },

    markSaved: () => set({ isDirty: false }),

    resetEditor: () => set({ ...initialEditorState }),
  };
});
