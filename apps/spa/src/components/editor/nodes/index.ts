import type { NodeTypes } from 'reactflow';
import { CustomNode } from './CustomNode';
import { StickyNode } from './StickyNode';

export { CustomNode, StickyNode };
export type { CustomNodeData, NodeStatus } from './CustomNode.types';

export const nodeTypes: NodeTypes = {
  custom: CustomNode,
  sticky: StickyNode,
};
