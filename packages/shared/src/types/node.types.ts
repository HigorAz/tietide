// Public surface re-exported verbatim so `@tietide/shared` and relative
// `../types/node.types.js` imports stay stable after the per-provider split.
export {
  NodeCategory,
  NodeType,
  NodeGroup,
  NODE_GROUP_ORDER,
  NODE_GROUP_LABELS,
} from './node-enums.js';
export type { NodeTypeDefinition } from './node-enums.js';

import { NodeCategory, NodeGroup, NodeType, type NodeTypeDefinition } from './node-enums.js';
import { GOOGLE_NODES } from './catalog/google.catalog.js';
import { MICROSOFT_NODES } from './catalog/microsoft.catalog.js';
import { SLACK_NODES } from './catalog/slack.catalog.js';
import { DISCORD_NODES } from './catalog/discord.catalog.js';
import { TWILIO_NODES } from './catalog/twilio.catalog.js';
import { TELEGRAM_NODES } from './catalog/telegram.catalog.js';
import { NOTION_NODES } from './catalog/notion.catalog.js';
import { TRELLO_NODES } from './catalog/trello.catalog.js';
import { AIRTABLE_NODES } from './catalog/airtable.catalog.js';
import { LINEAR_NODES } from './catalog/linear.catalog.js';
import { GITHUB_NODES } from './catalog/github.catalog.js';
import { ANTHROPIC_NODES } from './catalog/anthropic.catalog.js';
import { OPENAI_NODES } from './catalog/openai.catalog.js';
import { OLLAMA_NODES } from './catalog/ollama.catalog.js';
import { AI_IMAGE_NODES } from './catalog/ai.catalog.js';
import { INSTAGRAM_NODES } from './catalog/instagram.catalog.js';
import { WHATSAPP_NODES } from './catalog/whatsapp.catalog.js';
import { HUBSPOT_NODES } from './catalog/hubspot.catalog.js';
import { STRIPE_NODES } from './catalog/stripe.catalog.js';
import { MAILCHIMP_NODES } from './catalog/mailchimp.catalog.js';
import { CALENDLY_NODES } from './catalog/calendly.catalog.js';
import { POSTGRES_NODES } from './catalog/postgres.catalog.js';
import { MYSQL_NODES } from './catalog/mysql.catalog.js';
import { S3_NODES } from './catalog/s3.catalog.js';

// Core, provider-agnostic nodes (triggers, HTTP/Code, logic, annotation). Every
// other catalog entry is grouped per-provider under ./catalog/ and concatenated
// below. Grouping is a stable partition of the original order, so each
// (section, app) subsequence the SPA palette derives renders identically.
const CORE_NODES: NodeTypeDefinition[] = [
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

export const NODE_CATALOG: NodeTypeDefinition[] = [
  ...CORE_NODES,
  ...GOOGLE_NODES,
  ...MICROSOFT_NODES,
  ...SLACK_NODES,
  ...DISCORD_NODES,
  ...TWILIO_NODES,
  ...TELEGRAM_NODES,
  ...NOTION_NODES,
  ...TRELLO_NODES,
  ...AIRTABLE_NODES,
  ...LINEAR_NODES,
  ...GITHUB_NODES,
  ...ANTHROPIC_NODES,
  ...OPENAI_NODES,
  ...OLLAMA_NODES,
  ...AI_IMAGE_NODES,
  ...INSTAGRAM_NODES,
  ...WHATSAPP_NODES,
  ...HUBSPOT_NODES,
  ...STRIPE_NODES,
  ...MAILCHIMP_NODES,
  ...CALENDLY_NODES,
  ...POSTGRES_NODES,
  ...MYSQL_NODES,
  ...S3_NODES,
];
