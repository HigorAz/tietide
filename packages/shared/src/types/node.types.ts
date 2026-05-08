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
  GMAIL_SEND: 'gmail-send',
  GMAIL_SEARCH: 'gmail-search',
  DRIVE_CREATE: 'drive-create',
  DRIVE_LIST: 'drive-list',
  SHEETS_APPEND: 'sheets-append',
  SHEETS_READ: 'sheets-read',
  DOCS_CREATE: 'docs-create',
  CALENDAR_CREATE: 'calendar-create',
  OUTLOOK_SEND: 'outlook-send',
  OUTLOOK_SEARCH: 'outlook-search',
  EXCEL_APPEND: 'excel-append',
  EXCEL_READ: 'excel-read',
  ONEDRIVE_CREATE: 'onedrive-create',
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
  {
    type: NodeType.GMAIL_SEND,
    name: 'Gmail: Send Email',
    description: 'Send an email via Gmail',
    category: NodeCategory.ACTION,
    group: NodeGroup.COMMUNICATION,
    provider: 'google',
  },
  {
    type: NodeType.GMAIL_SEARCH,
    name: 'Gmail: Search Messages',
    description: 'Search Gmail messages with Gmail search syntax',
    category: NodeCategory.ACTION,
    group: NodeGroup.COMMUNICATION,
    provider: 'google',
  },
  {
    type: NodeType.DRIVE_CREATE,
    name: 'Drive: Create File',
    description: 'Create a file in Google Drive',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'google',
  },
  {
    type: NodeType.DRIVE_LIST,
    name: 'Drive: List Files',
    description: 'List files in a Google Drive folder',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'google',
  },
  {
    type: NodeType.SHEETS_APPEND,
    name: 'Sheets: Append Row',
    description: 'Append a row of values to a Google Sheet',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'google',
  },
  {
    type: NodeType.SHEETS_READ,
    name: 'Sheets: Read Range',
    description: 'Read a range from a Google Sheet (A1 notation)',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'google',
  },
  {
    type: NodeType.DOCS_CREATE,
    name: 'Docs: Create From Template',
    description: 'Copy a Google Doc template and replace placeholders',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'google',
  },
  {
    type: NodeType.CALENDAR_CREATE,
    name: 'Calendar: Create Event',
    description: 'Create a Google Calendar event',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'google',
  },
  {
    type: NodeType.OUTLOOK_SEND,
    name: 'Outlook: Send Email',
    description: 'Send an email via Outlook (Microsoft 365)',
    category: NodeCategory.ACTION,
    group: NodeGroup.COMMUNICATION,
    provider: 'microsoft',
  },
  {
    type: NodeType.OUTLOOK_SEARCH,
    name: 'Outlook: Search Inbox',
    description: 'Search Outlook messages with Microsoft Search syntax',
    category: NodeCategory.ACTION,
    group: NodeGroup.COMMUNICATION,
    provider: 'microsoft',
  },
  {
    type: NodeType.EXCEL_APPEND,
    name: 'Excel: Append Row',
    description: 'Append rows of values to an Excel Online worksheet',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'microsoft',
  },
  {
    type: NodeType.EXCEL_READ,
    name: 'Excel: Read Range',
    description: 'Read a range from an Excel Online worksheet (A1 notation)',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'microsoft',
  },
  {
    type: NodeType.ONEDRIVE_CREATE,
    name: 'OneDrive: Create File',
    description: 'Create a file in OneDrive',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'microsoft',
  },
];
