import { NodeCategory, NodeGroup, NodeType, type NodeTypeDefinition } from '../node-enums.js';

export const MYSQL_NODES: NodeTypeDefinition[] = [
  {
    type: NodeType.MYSQL_RUN_QUERY,
    name: 'MySQL: Run Parameterized Query',
    description: 'Run a parameterized SQL query against a MySQL database (no inline values)',
    category: NodeCategory.ACTION,
    group: NodeGroup.DATA,
    provider: 'mysql',
  },
];
