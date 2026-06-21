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
  type NodePositionChange,
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
import { ensureNodeAliases } from '@/lib/ensure-node-aliases';

const HISTORY_LIMIT = 50;

export interface EditorSnapshot {
  nodes: Node<CustomNodeData>[];
  edges: Edge[];
}

export type EditorViewMode = 'configure' | 'result';

/**
 * Canvas pointer behavior. 'pan' (default) = left-drag moves the canvas, hold
 * Shift/Alt to box-select. 'select' = left-drag draws a selection box, hold
 * Space to pan. Transient UI state — not captured by undo history.
 */
export type InteractionMode = 'pan' | 'select';

/**
 * The config field currently focused by the user. `insert` is the focused
 * DataPillInput's own caret-aware inserter, registered on focus so the
 * standalone DataPillPicker can drop a token into the live field. Transient UI
 * state — like `selectedNodeId`, it is never captured by undo history.
 */
export interface ActivePillField {
  nodeId: string;
  insert: (token: string) => void;
}

export interface EditorState {
  workflowId: string | null;
  nodes: Node<CustomNodeData>[];
  edges: Edge[];
  isDirty: boolean;
  // Transient: whether the in-progress node-drag gesture has actually moved a
  // node. Lets `onNodesChange` tell a real drop from a click (which React Flow
  // also reports as a no-op `position`/`dragging:false` change). Never captured
  // by undo history.
  dragMoved: boolean;
  selectedNodeId: string | null;
  activePillField: ActivePillField | null;
  past: EditorSnapshot[];
  future: EditorSnapshot[];
  entryRoute: string | null;
  // Global editor view: 'configure' shows the editable workflow, 'result'
  // overlays the loaded execution's per-node results. Both views read the same
  // editorStore + executionLiveStore — only the presentation flips, so editing
  // and inspecting never reload or clobber each other.
  viewMode: EditorViewMode;
  // Canvas pointer behavior (pan vs. box-select). Fed into editorTouchProps by
  // Canvas; toggled from the editor toolbar. Transient — not undo-tracked.
  interactionMode: InteractionMode;
}

export interface EditorActions {
  addNode: (nodeType: NodeType, position: XYPosition) => void;
  setNodes: (nodes: Node<CustomNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  selectNode: (id: string | null) => void;
  setActivePillField: (field: ActivePillField | null) => void;
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
  setViewMode: (mode: EditorViewMode) => void;
  setInteractionMode: (mode: InteractionMode) => void;
  toggleInteractionMode: () => void;
  resetEditor: () => void;
}

export type EditorStore = EditorState & EditorActions;

export const initialEditorState: EditorState = {
  workflowId: null,
  nodes: [],
  edges: [],
  isDirty: false,
  dragMoved: false,
  selectedNodeId: null,
  activePillField: null,
  past: [],
  future: [],
  entryRoute: null,
  viewMode: 'configure',
  interactionMode: 'pan',
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

const edgeChangeSnapshots = (changes: EdgeChange[]): boolean =>
  changes.some((c) => c.type === 'remove');

// True when a `position` change carries the node to coordinates that differ from
// where it currently sits. React Flow emits a final `position` change with
// `dragging:false` even on a plain click (no movement); comparing coordinates
// is how we tell a real move from that click artefact.
const nodePositionMoved = (change: NodePositionChange, nodes: Node<CustomNodeData>[]): boolean => {
  if (!change.position) return false;
  const node = nodes.find((n) => n.id === change.id);
  if (!node) return false;
  return node.position.x !== change.position.x || node.position.y !== change.position.y;
};

// A drop (`position` + dragging:false) that lands somewhere new — distinct from a
// click, which releases on the exact spot the node already occupies.
const nodeDropMoved = (changes: NodeChange[], nodes: Node<CustomNodeData>[]): boolean =>
  changes.some((c) => c.type === 'position' && c.dragging === false && nodePositionMoved(c, nodes));

const edgeChangeDirties = (changes: EdgeChange[]): boolean =>
  changes.some((c) => c.type !== 'select' && c.type !== 'reset');

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

      // Assign a stable data-pill alias to the new node (deduped against existing).
      commit({ nodes: ensureNodeAliases([...get().nodes, newNode]) });
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

      // A pure click is reported by React Flow as a `position` change with
      // `dragging:false` — identical in shape to the drop that ends a real drag.
      // Treat a release as an edit only when the node actually moved: either
      // during the gesture (a mid-drag `dragging:true` delta, remembered across
      // batches via `dragMoved`) or at the drop itself (release coordinates
      // differ from where the node sits). Otherwise clicking a node would dirty
      // the workflow and push a bogus undo snapshot.
      const movedDuringDrag = changes.some(
        (c) => c.type === 'position' && c.dragging === true && nodePositionMoved(c, prev.nodes),
      );
      const gestureMoved = prev.dragMoved || movedDuringDrag;
      const released = changes.some((c) => c.type === 'position' && c.dragging === false);
      const realDrop = released && (gestureMoved || nodeDropMoved(changes, prev.nodes));

      // A removal or a genuine drop is the only kind of node change that edits
      // the workflow; everything else (select / dimensions / reset / mid-drag /
      // click) is transient. Both dirty the workflow and push an undo snapshot.
      const removed = changes.some((c) => c.type === 'remove');
      const edits = removed || realDrop;

      if (edits) {
        set({
          nodes: nextNodes,
          selectedNodeId: nextSelection,
          past: pushSnapshot(prev.past, { nodes: prev.nodes, edges: prev.edges }),
          future: [],
          isDirty: true,
          dragMoved: false,
        });
        return;
      }

      set({
        nodes: nextNodes,
        selectedNodeId: nextSelection,
        // Carry mid-drag movement forward across batches; clear it on release.
        dragMoved: released ? false : gestureMoved,
      });
    },

    onEdgesChange: (changes) => {
      const prev = get();
      const nextEdges = applyEdgeChanges(changes, prev.edges);
      const dirties = edgeChangeDirties(changes);

      if (edgeChangeSnapshots(changes)) {
        set({
          edges: nextEdges,
          past: pushSnapshot(prev.past, { nodes: prev.nodes, edges: prev.edges }),
          future: [],
          isDirty: dirties || prev.isDirty,
        });
        return;
      }

      set({ edges: nextEdges, ...(dirties ? { isDirty: true } : {}) });
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

    setActivePillField: (field) => set({ activePillField: field }),

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
      const removedEdgeIds = new Set(
        prev.edges.filter((e) => e.selected === true).map((e) => e.id),
      );
      if (removedIds.size === 0 && removedEdgeIds.size === 0) return;

      const nextNodes = prev.nodes.filter((n) => !removedIds.has(n.id));
      // Drop edges explicitly selected for deletion, plus any that lose an
      // endpoint to a deleted node.
      const nextEdges = prev.edges.filter(
        (e) => !removedEdgeIds.has(e.id) && !removedIds.has(e.source) && !removedIds.has(e.target),
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
      // Drop any copied alias so pasted nodes get fresh, deduped ones (a paste is
      // a new node, not the same reference target as the original it was copied from).
      const selectedNew = newNodes.map((n) => ({
        ...n,
        selected: true,
        data: { ...n.data, alias: undefined },
      }));

      set({
        nodes: ensureNodeAliases([...deselected, ...selectedNew]),
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
        dragMoved: false,
        selectedNodeId: null,
        activePillField: null,
        past: [],
        future: [],
        entryRoute: entryRoute ?? null,
      });
    },

    markSaved: () => set({ isDirty: false }),

    setViewMode: (mode) => set({ viewMode: mode }),

    setInteractionMode: (mode) => set({ interactionMode: mode }),
    toggleInteractionMode: () =>
      set((s) => ({ interactionMode: s.interactionMode === 'pan' ? 'select' : 'pan' })),

    resetEditor: () => set({ ...initialEditorState }),
  };
});
