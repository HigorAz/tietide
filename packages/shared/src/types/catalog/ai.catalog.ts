import { NodeCategory, NodeGroup, NodeType, type NodeTypeDefinition } from '../node-enums.js';

export const AI_IMAGE_NODES: NodeTypeDefinition[] = [
  {
    type: NodeType.AI_GENERATE_IMAGE,
    name: 'AI: Generate Image',
    description:
      'Generate an image from a text prompt. Pollinations is free + keyless and returns a public image URL; Hugging Face uses a token and returns image bytes.',
    category: NodeCategory.ACTION,
    group: NodeGroup.AI,
    provider: 'ai-image',
  },
];
