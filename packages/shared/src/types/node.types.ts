export const NodeCategory = {
  TRIGGER: 'trigger',
  ACTION: 'action',
  LOGIC: 'logic',
  ANNOTATION: 'annotation',
} as const;

export type NodeCategory = (typeof NodeCategory)[keyof typeof NodeCategory];

export const NodeType = {
  MANUAL_TRIGGER: 'manual-trigger',
  CRON_TRIGGER: 'cron-trigger',
  WEBHOOK_TRIGGER: 'webhook-trigger',
  HTTP_REQUEST: 'http-request',
  CODE: 'code',
  CONDITIONAL: 'conditional',
  ITERATOR: 'iterator',
  SUBWORKFLOW: 'subworkflow',
  RETURN: 'return',
  STICKY: 'sticky',
} as const;

export type NodeType = (typeof NodeType)[keyof typeof NodeType];

export const NodeGroup = {
  TRIGGERS: 'triggers',
  ACTIONS: 'actions',
  LOGIC: 'logic',
  DATA: 'data',
  AI: 'ai',
  COMMUNICATION: 'communication',
  PRODUCTIVITY: 'productivity',
  COMMERCE: 'commerce',
  CUSTOM: 'custom',
} as const;

export type NodeGroup = (typeof NodeGroup)[keyof typeof NodeGroup];

// Stable display order for the SPA's node-library palette.
export const NODE_GROUP_ORDER: readonly NodeGroup[] = [
  NodeGroup.TRIGGERS,
  NodeGroup.ACTIONS,
  NodeGroup.LOGIC,
  NodeGroup.DATA,
  NodeGroup.AI,
  NodeGroup.COMMUNICATION,
  NodeGroup.PRODUCTIVITY,
  NodeGroup.COMMERCE,
  NodeGroup.CUSTOM,
];

export const NODE_GROUP_LABELS: Record<NodeGroup, string> = {
  [NodeGroup.TRIGGERS]: 'Triggers',
  [NodeGroup.ACTIONS]: 'Actions',
  [NodeGroup.LOGIC]: 'Logic',
  [NodeGroup.DATA]: 'Data',
  [NodeGroup.AI]: 'AI',
  [NodeGroup.COMMUNICATION]: 'Communication',
  [NodeGroup.PRODUCTIVITY]: 'Productivity',
  [NodeGroup.COMMERCE]: 'Commerce',
  [NodeGroup.CUSTOM]: 'Custom',
};

export interface NodeTypeDefinition {
  type: NodeType;
  name: string;
  description: string;
  category: NodeCategory;
  // Optional palette-display group. When omitted, the SPA infers from `category`
  // (trigger → triggers, action → actions, logic → logic). Domain-specific groups
  // (data/ai/communication/...) are reserved for future connector nodes.
  group?: NodeGroup;
  // Optional provider tag used for palette filtering (e.g. 'slack', 'openai').
  provider?: string;
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
  {
    type: NodeType.ITERATOR,
    name: 'Iterator (For Each)',
    description: 'Run downstream subgraph once per item in an array',
    category: NodeCategory.LOGIC,
  },
  {
    type: NodeType.SUBWORKFLOW,
    name: 'Subworkflow',
    description: 'Invoke another workflow synchronously and use its return value',
    category: NodeCategory.LOGIC,
  },
  {
    type: NodeType.RETURN,
    name: 'Return',
    description: 'Mark the value to forward to a parent subworkflow caller',
    category: NodeCategory.LOGIC,
  },
  {
    type: NodeType.STICKY,
    name: 'Sticky Note',
    description: 'Add a colored note for documentation. Does not execute.',
    category: NodeCategory.ANNOTATION,
    group: NodeGroup.CUSTOM,
  },
];
