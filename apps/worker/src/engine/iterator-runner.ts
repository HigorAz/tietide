import type { WorkflowDefinition, WorkflowEdge, WorkflowNode } from '@tietide/shared';

export interface BodySubgraph {
  bodyNodeIds: Set<string>;
  bodyEntryNodeIds: string[];
  bodyEdges: WorkflowEdge[];
}

export class CrossBoundaryEdgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrossBoundaryEdgeError';
  }
}

export function extractBodySubgraph(
  definition: WorkflowDefinition,
  iteratorNodeId: string,
): BodySubgraph {
  const bodyEntryNodeIds = definition.edges
    .filter((e) => e.source === iteratorNodeId && e.sourceHandle === 'body')
    .map((e) => e.target);

  const bodyNodeIds = new Set<string>();
  const queue: string[] = [...bodyEntryNodeIds];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (bodyNodeIds.has(id)) continue;
    bodyNodeIds.add(id);
    for (const e of definition.edges) {
      if (e.source === id && !bodyNodeIds.has(e.target)) {
        queue.push(e.target);
      }
    }
  }

  const bodyEdges = definition.edges.filter(
    (e) => bodyNodeIds.has(e.source) && bodyNodeIds.has(e.target),
  );

  return { bodyNodeIds, bodyEntryNodeIds, bodyEdges };
}

export function validateBodySubgraph(
  definition: WorkflowDefinition,
  iteratorNodeId: string,
  bodyNodeIds: Set<string>,
): void {
  for (const e of definition.edges) {
    if (!bodyNodeIds.has(e.target)) continue;
    if (bodyNodeIds.has(e.source)) continue;
    if (e.source === iteratorNodeId && e.sourceHandle === 'body') continue;
    throw new CrossBoundaryEdgeError(
      `Edge "${e.id}" enters iterator body node "${e.target}" from "${e.source}" outside the body. ` +
        `An iterator's body subgraph must be self-contained — only edges from the iterator's "body" handle may enter it.`,
    );
  }
}

export interface BuildBodyDefinitionArgs {
  definition: WorkflowDefinition;
  iteratorNodeId: string;
  bodyNodeIds: Set<string>;
  bodyEntryNodeIds: string[];
  syntheticTriggerId: string;
}

export function buildBodyDefinition(args: BuildBodyDefinitionArgs): WorkflowDefinition {
  const { definition, bodyNodeIds, bodyEntryNodeIds, syntheticTriggerId } = args;

  const triggerNode: WorkflowNode = {
    id: syntheticTriggerId,
    type: 'manual-trigger',
    name: 'Iteration',
    position: { x: 0, y: 0 },
    config: {},
  };

  const bodyNodes = definition.nodes.filter((n) => bodyNodeIds.has(n.id));
  const bodyEdges = definition.edges.filter(
    (e) => bodyNodeIds.has(e.source) && bodyNodeIds.has(e.target),
  );
  const entryEdges: WorkflowEdge[] = bodyEntryNodeIds.map((target, i) => ({
    id: `${syntheticTriggerId}-to-${target}-${i}`,
    source: syntheticTriggerId,
    target,
  }));

  return {
    nodes: [triggerNode, ...bodyNodes],
    edges: [...entryEdges, ...bodyEdges],
  };
}
