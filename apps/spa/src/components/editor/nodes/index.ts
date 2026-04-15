import type { NodeTypes } from 'reactflow';
import { CustomNode } from './CustomNode';

export { CustomNode };
export type { CustomNodeData, NodeStatus } from './CustomNode.types';

export const nodeTypes: NodeTypes = {
  custom: CustomNode,
};
