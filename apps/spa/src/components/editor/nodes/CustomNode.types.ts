import type { NodeType } from '@tietide/shared';

export type NodeStatus = 'idle' | 'running' | 'success' | 'failed';

export interface CustomNodeData {
  label: string;
  description?: string;
  nodeType: NodeType;
  status?: NodeStatus;
}
