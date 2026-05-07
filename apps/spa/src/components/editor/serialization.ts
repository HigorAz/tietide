import type { Edge, Node } from 'reactflow';
import {
  NODE_CATALOG,
  type NodeType,
  type WorkflowDefinition,
  type WorkflowEdge,
  type WorkflowNode,
} from '@tietide/shared';
import type { CustomNodeData } from './nodes/CustomNode.types';

export function toWorkflowDefinition(
  nodes: Node<CustomNodeData>[],
  edges: Edge[],
): WorkflowDefinition {
  return {
    nodes: nodes.map<WorkflowNode>((n) => {
      const base: WorkflowNode = {
        id: n.id,
        type: n.data.nodeType,
        name: n.data.label,
        position: { x: n.position.x, y: n.position.y },
        config: n.data.config ?? {},
      };
      if (n.data.skipped) base.skipped = true;
      return base;
    }),
    edges: edges.map<WorkflowEdge>((e) => {
      const base: WorkflowEdge = { id: e.id, source: e.source, target: e.target };
      if (e.sourceHandle != null) base.sourceHandle = e.sourceHandle;
      if (e.targetHandle != null) base.targetHandle = e.targetHandle;
      const kind = (e.data as { kind?: 'success' | 'error' } | undefined)?.kind;
      if (kind === 'error') base.kind = 'error';
      return base;
    }),
  };
}

export function fromWorkflowDefinition(def: WorkflowDefinition): {
  nodes: Node<CustomNodeData>[];
  edges: Edge[];
} {
  const nodes = def.nodes.map<Node<CustomNodeData>>((n) => {
    const catalogEntry = NODE_CATALOG.find((d) => d.type === n.type);
    const data: CustomNodeData = {
      label: n.name,
      description: catalogEntry?.description ?? '',
      nodeType: n.type as NodeType,
      status: 'idle',
      config: n.config ?? {},
    };
    if (n.skipped === true) data.skipped = true;
    return {
      id: n.id,
      type: 'custom',
      position: { x: n.position.x, y: n.position.y },
      data,
    };
  });

  const edges = def.edges.map<Edge>((e) => {
    const base: Edge = {
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'livingInk',
    };
    if (e.sourceHandle != null) base.sourceHandle = e.sourceHandle;
    if (e.targetHandle != null) base.targetHandle = e.targetHandle;
    if (e.kind === 'error') base.data = { kind: 'error' };
    return base;
  });

  return { nodes, edges };
}
