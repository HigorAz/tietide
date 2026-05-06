import { z } from 'zod';
import type { Edge, Node } from 'reactflow';
import type { CustomNodeData, NodeStatus } from '@/components/editor/nodes/CustomNode.types';
import type { NodeType } from '@tietide/shared';

export const CLIPBOARD_VERSION = 1 as const;

const NodeStatusSchema = z.union([
  z.literal('idle'),
  z.literal('running'),
  z.literal('success'),
  z.literal('failed'),
  z.literal('skipped'),
]);

const ClipboardNodeDataSchema = z.object({
  label: z.string(),
  description: z.string().optional(),
  nodeType: z.string(),
  status: NodeStatusSchema.optional(),
  config: z.record(z.unknown()).optional(),
  skipped: z.boolean().optional(),
});

const ClipboardNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }),
  data: ClipboardNodeDataSchema,
});

const ClipboardEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullish(),
  targetHandle: z.string().nullish(),
});

export const ClipboardPayloadSchema = z.object({
  tietideClipboard: z.literal(CLIPBOARD_VERSION),
  nodes: z.array(ClipboardNodeSchema),
  edges: z.array(ClipboardEdgeSchema),
});

export type ClipboardNode = z.infer<typeof ClipboardNodeSchema>;
export type ClipboardEdge = z.infer<typeof ClipboardEdgeSchema>;
export type ClipboardPayload = z.infer<typeof ClipboardPayloadSchema>;

export class ClipboardFormatError extends Error {
  constructor(message = 'Clipboard does not contain valid TieTide nodes') {
    super(message);
    this.name = 'ClipboardFormatError';
  }
}

const newNodeId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `node-${crypto.randomUUID()}`;
  }
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const newEdgeId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `edge-${crypto.randomUUID()}`;
  }
  return `edge-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const stripUndefined = <T extends object>(obj: T): T => {
  const out = {} as T;
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
};

export function buildClipboardPayload(
  selectedNodes: Node<CustomNodeData>[],
  allEdges: Edge[],
): ClipboardPayload {
  const selectedIds = new Set(selectedNodes.map((n) => n.id));

  const nodes: ClipboardNode[] = selectedNodes.map((n) => ({
    id: n.id,
    ...(n.type !== undefined ? { type: n.type } : {}),
    position: { x: n.position.x, y: n.position.y },
    data: stripUndefined({
      label: n.data.label,
      description: n.data.description,
      nodeType: n.data.nodeType,
      status: n.data.status,
      config: n.data.config ?? {},
      skipped: n.data.skipped === true ? true : undefined,
    }),
  }));

  const edges: ClipboardEdge[] = allEdges
    .filter((e) => selectedIds.has(e.source) && selectedIds.has(e.target))
    .map((e) =>
      stripUndefined({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
      }),
    );

  return { tietideClipboard: CLIPBOARD_VERSION, nodes, edges };
}

export function serializeClipboardPayload(payload: ClipboardPayload): string {
  return JSON.stringify(payload);
}

export function parseClipboardPayload(json: string): ClipboardPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ClipboardFormatError();
  }
  const result = ClipboardPayloadSchema.safeParse(parsed);
  if (!result.success) throw new ClipboardFormatError();
  return result.data;
}

export interface RemapResult {
  nodes: Node<CustomNodeData>[];
  edges: Edge[];
  idMap: Record<string, string>;
}

export interface RemapOptions {
  offset?: { x: number; y: number };
}

const DEFAULT_OFFSET = { x: 30, y: 30 } as const;

export function remapClipboardIds(
  payload: ClipboardPayload,
  { offset = DEFAULT_OFFSET }: RemapOptions = {},
): RemapResult {
  const idMap: Record<string, string> = {};
  for (const n of payload.nodes) idMap[n.id] = newNodeId();

  const nodes: Node<CustomNodeData>[] = payload.nodes.map((n) => {
    const data: CustomNodeData = {
      label: n.data.label,
      description: n.data.description ?? '',
      nodeType: n.data.nodeType as NodeType,
      status: 'idle' as NodeStatus,
      config: n.data.config ?? {},
    };
    if (n.data.skipped === true) data.skipped = true;

    return {
      id: idMap[n.id],
      type: n.type ?? 'custom',
      position: { x: n.position.x + offset.x, y: n.position.y + offset.y },
      data,
    };
  });

  const edges: Edge[] = payload.edges
    .filter((e) => idMap[e.source] && idMap[e.target])
    .map((e) => {
      const edge: Edge = {
        id: newEdgeId(),
        source: idMap[e.source],
        target: idMap[e.target],
        type: 'livingInk',
      };
      if (e.sourceHandle != null) edge.sourceHandle = e.sourceHandle;
      if (e.targetHandle != null) edge.targetHandle = e.targetHandle;
      return edge;
    });

  return { nodes, edges, idMap };
}
