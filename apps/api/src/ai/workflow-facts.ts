import {
  NODE_CATALOG,
  type NodeTypeDefinition,
  type WorkflowDefinition,
  type WorkflowNode,
} from '@tietide/shared';

/**
 * Deterministic, computed-not-inferred facts about a workflow, extracted from
 * its definition so the documentation LLM is grounded in ground truth rather
 * than guessing structure. Every field is a pure function of the definition +
 * the node catalog. See docs/claude/services.md (AI documentation).
 */
export interface WorkflowFactNode {
  id: string;
  label: string;
  type: string;
  category: string;
  provider?: string;
  alias?: string;
  skipped?: boolean;
}

export interface WorkflowFactTrigger {
  id: string;
  label: string;
  type: string;
  config: Record<string, unknown>;
}

export interface WorkflowFactBranch {
  nodeLabel: string;
  condition?: string;
  trueTargets: string[];
  falseTargets: string[];
}

export interface WorkflowFactErrorEdge {
  sourceLabel: string;
  targetLabel: string;
}

export interface WorkflowFactConnection {
  provider: string;
  nodeLabels: string[];
}

export interface WorkflowFactPrerequisites {
  connections: WorkflowFactConnection[];
  secrets: string[];
  envVars: string[];
  externalEndpoints: string[];
}

export interface WorkflowFactDataPillRef {
  nodeLabel: string;
  reads: { from: string; field: string }[];
}

export interface WorkflowFacts {
  nodes: WorkflowFactNode[];
  executionOrder: string[];
  trigger: WorkflowFactTrigger | null;
  branches: WorkflowFactBranch[];
  errorEdges: WorkflowFactErrorEdge[];
  prerequisites: WorkflowFactPrerequisites;
  dataPillRefs: WorkflowFactDataPillRef[];
}

const CATALOG_BY_TYPE: Map<string, NodeTypeDefinition> = new Map(
  NODE_CATALOG.map((d) => [d.type as string, d]),
);

// Recursively collect every string leaf from a node's config so token scans
// (secrets / env vars / data pills / URLs) see deeply-nested values too.
function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
  } else if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) collectStrings(v, out);
  }
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

const SECRET_RE = /\{\{\s*secrets\.([A-Za-z0-9_]+)/g;
const ENV_RE = /\{\{\s*([A-Z][A-Z0-9_]+)\s*\}\}/g;
const TRIGGER_PILL_RE = /\{\{\s*trigger\.([\w.]+?)\s*\}\}/g;
const STEPS_PILL_RE = /\{\{\s*steps\.(\w+)\.([\w.]+?)\s*\}\}/g;

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** Topological order (Kahn's) seeded from in-degree-0 nodes in definition order. */
function topologicalOrder(def: WorkflowDefinition): string[] {
  const ids = def.nodes.map((n) => n.id);
  const indegree = new Map<string, number>(ids.map((id) => [id, 0]));
  const adjacency = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const edge of def.edges) {
    if (!indegree.has(edge.target) || !adjacency.has(edge.source)) continue;
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    adjacency.get(edge.source)?.push(edge.target);
  }

  const queue = ids.filter((id) => (indegree.get(id) ?? 0) === 0);
  const order: string[] = [];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
    for (const next of adjacency.get(id) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining <= 0 && !seen.has(next)) queue.push(next);
    }
  }
  // Append any nodes dropped by a cycle so nothing is silently lost.
  for (const id of ids) if (!seen.has(id)) order.push(id);
  return order;
}

export function extractWorkflowFacts(definition: WorkflowDefinition): WorkflowFacts {
  const nodesById = new Map<string, WorkflowNode>(definition.nodes.map((n) => [n.id, n]));
  const catalogOf = (type: string): NodeTypeDefinition | undefined => CATALOG_BY_TYPE.get(type);
  const labelOf = (id: string): string => {
    const node = nodesById.get(id);
    if (!node) return id;
    return node.name || catalogOf(node.type)?.name || node.type;
  };

  const nodes: WorkflowFactNode[] = definition.nodes.map((n) => {
    const def = catalogOf(n.type);
    return {
      id: n.id,
      label: n.name || def?.name || n.type,
      type: n.type,
      category: def?.category ?? 'unknown',
      ...(def?.provider ? { provider: def.provider } : {}),
      ...(n.alias ? { alias: n.alias } : {}),
      ...(n.skipped ? { skipped: true } : {}),
    };
  });

  // Trigger: first node in the trigger category, else an in-degree-0 node, else first.
  const targets = new Set(definition.edges.map((e) => e.target));
  const triggerNode =
    definition.nodes.find((n) => catalogOf(n.type)?.category === 'trigger') ??
    definition.nodes.find((n) => !targets.has(n.id)) ??
    definition.nodes[0] ??
    null;
  const trigger: WorkflowFactTrigger | null = triggerNode
    ? {
        id: triggerNode.id,
        label: labelOf(triggerNode.id),
        type: triggerNode.type,
        config: triggerNode.config ?? {},
      }
    : null;

  // Conditional branches: condition + true/false target labels.
  const branches: WorkflowFactBranch[] = definition.nodes
    .filter((n) => n.type === 'conditional')
    .map((n) => {
      const outgoing = definition.edges.filter((e) => e.source === n.id);
      const condition = n.config?.condition;
      return {
        nodeLabel: labelOf(n.id),
        ...(typeof condition === 'string' ? { condition } : {}),
        trueTargets: outgoing
          .filter((e) => e.sourceHandle === 'true')
          .map((e) => labelOf(e.target)),
        falseTargets: outgoing
          .filter((e) => e.sourceHandle === 'false')
          .map((e) => labelOf(e.target)),
      };
    });

  const errorEdges: WorkflowFactErrorEdge[] = definition.edges
    .filter((e) => e.sourceHandle === 'error' || e.kind === 'error')
    .map((e) => ({ sourceLabel: labelOf(e.source), targetLabel: labelOf(e.target) }));

  // Prerequisites — derived, never inferred.
  const connectionsByProvider = new Map<string, string[]>();
  const secrets = new Set<string>();
  const envVars = new Set<string>();
  const endpoints = new Set<string>();

  for (const node of definition.nodes) {
    const config = node.config ?? {};
    const connectionId = config.connectionId;
    if (typeof connectionId === 'string' && connectionId.trim() !== '') {
      const provider = catalogOf(node.type)?.provider ?? node.type;
      const list = connectionsByProvider.get(provider) ?? [];
      list.push(labelOf(node.id));
      connectionsByProvider.set(provider, list);
    }

    const strings: string[] = [];
    collectStrings(config, strings);
    for (const raw of strings) {
      for (const m of raw.matchAll(SECRET_RE)) secrets.add(m[1]);
      for (const m of raw.matchAll(ENV_RE)) envVars.add(m[1]);
      if (/^https?:\/\//.test(raw.trim())) {
        const host = hostOf(raw.trim());
        if (host) endpoints.add(host);
      }
    }
  }

  const prerequisites: WorkflowFactPrerequisites = {
    connections: [...connectionsByProvider.entries()]
      .map(([provider, nodeLabels]) => ({ provider, nodeLabels }))
      .sort((a, b) => a.provider.localeCompare(b.provider)),
    secrets: uniqueSorted(secrets),
    envVars: uniqueSorted(envVars),
    externalEndpoints: uniqueSorted(endpoints),
  };

  // Data-pill references per node (upstream reads).
  const dataPillRefs: WorkflowFactDataPillRef[] = [];
  for (const node of definition.nodes) {
    const strings: string[] = [];
    collectStrings(node.config ?? {}, strings);
    const reads: { from: string; field: string }[] = [];
    const seen = new Set<string>();
    for (const raw of strings) {
      for (const m of raw.matchAll(TRIGGER_PILL_RE)) {
        const key = `trigger:${m[1]}`;
        if (!seen.has(key)) {
          seen.add(key);
          reads.push({ from: 'trigger', field: m[1] });
        }
      }
      for (const m of raw.matchAll(STEPS_PILL_RE)) {
        const key = `${m[1]}:${m[2]}`;
        if (!seen.has(key)) {
          seen.add(key);
          reads.push({ from: m[1], field: m[2] });
        }
      }
    }
    if (reads.length > 0) dataPillRefs.push({ nodeLabel: labelOf(node.id), reads });
  }

  return {
    nodes,
    executionOrder: topologicalOrder(definition),
    trigger,
    branches,
    errorEdges,
    prerequisites,
    dataPillRefs,
  };
}
