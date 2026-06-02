import { NodeCategory, NodeGroup, NodeType, type NodeTypeDefinition } from '../node-enums.js';

export const ANTHROPIC_NODES: NodeTypeDefinition[] = [
  {
    type: NodeType.CLAUDE_MESSAGES,
    name: 'Claude: Messages',
    description: 'Send a prompt to the Anthropic Messages API and capture the response',
    category: NodeCategory.ACTION,
    group: NodeGroup.AI,
    provider: 'anthropic',
  },
  {
    type: NodeType.ANTHROPIC_VISION,
    name: 'Claude: Vision',
    description: 'Analyze an image (URL or base64) with a Claude vision prompt',
    category: NodeCategory.ACTION,
    group: NodeGroup.AI,
    provider: 'anthropic',
  },
];
