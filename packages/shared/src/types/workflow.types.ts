export interface WorkflowNode {
  id: string;
  type: string;
  name: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  skipped?: boolean;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  kind?: 'success' | 'error';
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowDocumentationMeta {
  generatedAt: Date;
  version: number;
}

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  definition: WorkflowDefinition;
  isActive: boolean;
  version: number;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  executionCount: number;
  documentation: WorkflowDocumentationMeta | null;
}
