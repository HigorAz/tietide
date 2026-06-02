import { NodeCategory, NodeGroup, NodeType, type NodeTypeDefinition } from '../node-enums.js';

export const OPENAI_NODES: NodeTypeDefinition[] = [
  {
    type: NodeType.OPENAI_CHAT_COMPLETION,
    name: 'OpenAI: Chat Completion',
    description: 'Send a chat completion request to OpenAI (gpt-4o, gpt-4-turbo, etc.)',
    category: NodeCategory.ACTION,
    group: NodeGroup.AI,
    provider: 'openai',
  },
  {
    type: NodeType.OPENAI_EMBEDDINGS,
    name: 'OpenAI: Embeddings',
    description: 'Generate an embedding vector for a text input',
    category: NodeCategory.ACTION,
    group: NodeGroup.AI,
    provider: 'openai',
  },
  {
    type: NodeType.OPENAI_GENERATE_IMAGE,
    name: 'OpenAI: Generate Image',
    description: 'Generate an image from a text prompt (DALL·E)',
    category: NodeCategory.ACTION,
    group: NodeGroup.AI,
    provider: 'openai',
  },
];
