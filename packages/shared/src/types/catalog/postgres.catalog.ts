import { NodeCategory, NodeGroup, NodeType, type NodeTypeDefinition } from '../node-enums.js';

export const POSTGRES_NODES: NodeTypeDefinition[] = [
  {
    type: NodeType.POSTGRES_RUN_QUERY,
    name: 'Postgres: Run Parameterized Query',
    description: 'Run a parameterized SQL query against a Postgres database (no inline values)',
    category: NodeCategory.ACTION,
    group: NodeGroup.DATA,
    provider: 'postgres',
  },
];
