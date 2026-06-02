import { NodeCategory, NodeGroup, NodeType, type NodeTypeDefinition } from '../node-enums.js';

export const OLLAMA_NODES: NodeTypeDefinition[] = [
  {
    type: NodeType.OLLAMA_GENERATE,
    name: 'Ollama: Generate',
    description: 'Generate text from a self-hosted Ollama server (per-workspace connection)',
    category: NodeCategory.ACTION,
    group: NodeGroup.AI,
    provider: 'ollama',
  },
  {
    type: NodeType.OLLAMA_EMBEDDINGS,
    name: 'Ollama: Embeddings',
    description: 'Generate an embedding vector from a self-hosted Ollama model',
    category: NodeCategory.ACTION,
    group: NodeGroup.AI,
    provider: 'ollama',
  },
];
