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
    nodes: nodes.map<WorkflowNode>((n) => ({
      id: n.id,
      type: n.data.nodeType,
      name: n.data.label,
      position: { x: n.position.x, y: n.position.y },
      config: n.data.config ?? {},
    })),
    edges: edges.map<WorkflowEdge>((e) => {
      const base: WorkflowEdge = { id: e.id, source: e.source, target: e.target };
      if (e.sourceHandle != null) base.sourceHandle = e.sourceHandle;
      if (e.targetHandle != null) base.targetHandle = e.targetHandle;
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
    return {
      id: n.id,
      type: 'custom',
      position: { x: n.position.x, y: n.position.y },
      data: {
        label: n.name,
        description: catalogEntry?.description ?? '',
        nodeType: n.type as NodeType,
        status: 'idle',
        config: n.config ?? {},
      },
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
    return base;
  });

  return { nodes, edges };
}
