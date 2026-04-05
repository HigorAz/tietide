export const NodeCategory = {
  TRIGGER: 'trigger',
  ACTION: 'action',
  LOGIC: 'logic',
} as const;

export type NodeCategory = (typeof NodeCategory)[keyof typeof NodeCategory];

export const NodeType = {
  MANUAL_TRIGGER: 'manual-trigger',
  CRON_TRIGGER: 'cron-trigger',
  WEBHOOK_TRIGGER: 'webhook-trigger',
  HTTP_REQUEST: 'http-request',
  CODE: 'code',
  CONDITIONAL: 'conditional',
} as const;

export type NodeType = (typeof NodeType)[keyof typeof NodeType];

export interface NodeTypeDefinition {
  type: NodeType;
  name: string;
  description: string;
  category: NodeCategory;
}

export const NODE_CATALOG: NodeTypeDefinition[] = [
  {
    type: NodeType.MANUAL_TRIGGER,
    name: 'Manual Trigger',
    description: 'Start workflow manually',
    category: NodeCategory.TRIGGER,
  },
  {
    type: NodeType.CRON_TRIGGER,
    name: 'Cron Trigger',
    description: 'Start workflow on a schedule',
    category: NodeCategory.TRIGGER,
  },
  {
    type: NodeType.WEBHOOK_TRIGGER,
    name: 'Webhook Trigger',
    description: 'Start workflow via HTTP webhook',
    category: NodeCategory.TRIGGER,
  },
  {
    type: NodeType.HTTP_REQUEST,
    name: 'HTTP Request',
    description: 'Make an HTTP request to an external API',
    category: NodeCategory.ACTION,
  },
  {
    type: NodeType.CODE,
    name: 'Code',
    description: 'Execute custom JavaScript code',
    category: NodeCategory.ACTION,
  },
  {
    type: NodeType.CONDITIONAL,
    name: 'Conditional (IF)',
    description: 'Branch based on a condition',
    category: NodeCategory.LOGIC,
  },
];
