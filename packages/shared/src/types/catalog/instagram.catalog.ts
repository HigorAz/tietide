import { NodeCategory, NodeGroup, NodeType, type NodeTypeDefinition } from '../node-enums.js';

export const INSTAGRAM_NODES: NodeTypeDefinition[] = [
  {
    type: NodeType.INSTAGRAM_PUBLISH_PHOTO,
    name: 'Instagram: Publish Photo',
    description: 'Publish a single image post to an Instagram Business account (with a caption)',
    category: NodeCategory.ACTION,
    group: NodeGroup.COMMUNICATION,
    provider: 'instagram',
  },
];
