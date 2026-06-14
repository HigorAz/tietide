import {
  Cloud,
  Code2,
  GitBranch,
  Hash,
  HardDrive,
  Image as ImageIcon,
  Mail,
  Phone,
  Sheet,
  Sparkles,
  StickyNote,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import {
  siAirtable,
  siAnthropic,
  siCalendly,
  siDiscord,
  siGithub,
  siGmail,
  siInstagram,
  siWhatsapp,
  siGooglecalendar,
  siGoogledocs,
  siGoogledrive,
  siGooglesheets,
  siHubspot,
  siLinear,
  siMailchimp,
  siMysql,
  siNotion,
  siOllama,
  siPostgresql,
  siStripe,
  siTelegram,
  siTrello,
} from 'simple-icons';
import { NodeType } from '@tietide/shared';

export type AppId =
  | 'core'
  | 'gmail'
  | 'google-drive'
  | 'google-sheets'
  | 'google-docs'
  | 'google-calendar'
  | 'outlook'
  | 'excel'
  | 'onedrive'
  | 'slack'
  | 'discord'
  | 'twilio'
  | 'telegram'
  | 'notion'
  | 'trello'
  | 'airtable'
  | 'linear'
  | 'github'
  | 'instagram'
  | 'whatsapp'
  | 'anthropic'
  | 'openai'
  | 'ollama'
  | 'ai'
  | 'hubspot'
  | 'stripe'
  | 'mailchimp'
  | 'calendly'
  | 'postgres'
  | 'mysql'
  | 's3'
  | 'logic'
  | 'custom';

export interface BrandSvg {
  path: string;
  hex: string;
}

export interface AppDescriptor {
  id: AppId;
  label: string;
  brand?: BrandSvg;
  icon?: LucideIcon;
}

const brand = (src: { path: string; hex: string }): BrandSvg => ({ path: src.path, hex: src.hex });

export const APP_INFO: Record<AppId, AppDescriptor> = {
  core: { id: 'core', label: 'Core', icon: Zap },
  gmail: { id: 'gmail', label: 'Gmail', brand: brand(siGmail) },
  'google-drive': { id: 'google-drive', label: 'Google Drive', brand: brand(siGoogledrive) },
  'google-sheets': { id: 'google-sheets', label: 'Google Sheets', brand: brand(siGooglesheets) },
  'google-docs': { id: 'google-docs', label: 'Google Docs', brand: brand(siGoogledocs) },
  'google-calendar': {
    id: 'google-calendar',
    label: 'Google Calendar',
    brand: brand(siGooglecalendar),
  },
  outlook: { id: 'outlook', label: 'Outlook', icon: Mail },
  excel: { id: 'excel', label: 'Excel', icon: Sheet },
  onedrive: { id: 'onedrive', label: 'OneDrive', icon: HardDrive },
  slack: { id: 'slack', label: 'Slack', icon: Hash },
  discord: { id: 'discord', label: 'Discord', brand: brand(siDiscord) },
  twilio: { id: 'twilio', label: 'Twilio', icon: Phone },
  telegram: { id: 'telegram', label: 'Telegram', brand: brand(siTelegram) },
  notion: { id: 'notion', label: 'Notion', brand: brand(siNotion) },
  trello: { id: 'trello', label: 'Trello', brand: brand(siTrello) },
  airtable: { id: 'airtable', label: 'Airtable', brand: brand(siAirtable) },
  linear: { id: 'linear', label: 'Linear', brand: brand(siLinear) },
  github: { id: 'github', label: 'GitHub', brand: brand(siGithub) },
  instagram: { id: 'instagram', label: 'Instagram', brand: brand(siInstagram) },
  whatsapp: { id: 'whatsapp', label: 'WhatsApp', brand: brand(siWhatsapp) },
  anthropic: { id: 'anthropic', label: 'Anthropic Claude', brand: brand(siAnthropic) },
  openai: { id: 'openai', label: 'OpenAI', icon: Sparkles },
  ollama: { id: 'ollama', label: 'Ollama', brand: brand(siOllama) },
  ai: { id: 'ai', label: 'AI', icon: ImageIcon },
  hubspot: { id: 'hubspot', label: 'HubSpot', brand: brand(siHubspot) },
  stripe: { id: 'stripe', label: 'Stripe', brand: brand(siStripe) },
  mailchimp: { id: 'mailchimp', label: 'Mailchimp', brand: brand(siMailchimp) },
  calendly: { id: 'calendly', label: 'Calendly', brand: brand(siCalendly) },
  postgres: { id: 'postgres', label: 'Postgres', brand: brand(siPostgresql) },
  mysql: { id: 'mysql', label: 'MySQL', brand: brand(siMysql) },
  s3: { id: 's3', label: 'S3', icon: Cloud },
  logic: { id: 'logic', label: 'Logic', icon: GitBranch },
  custom: { id: 'custom', label: 'Custom', icon: StickyNote },
};

// Stable display order inside each section (Core first, then alphabetical app labels,
// trailing buckets at end). Per-section filtering happens in NodeLibrary based on the
// nodes that bucket into each app.
export const APP_ORDER: readonly AppId[] = [
  'core',
  'ai',
  'airtable',
  'anthropic',
  'calendly',
  'discord',
  'excel',
  'github',
  'gmail',
  'instagram',
  'whatsapp',
  'google-calendar',
  'google-docs',
  'google-drive',
  'google-sheets',
  'hubspot',
  'linear',
  'mailchimp',
  'mysql',
  'notion',
  'ollama',
  'onedrive',
  'openai',
  'outlook',
  'postgres',
  's3',
  'slack',
  'stripe',
  'telegram',
  'trello',
  'twilio',
  'logic',
  'custom',
];

// Map an individual NodeType to the app/category bucket it belongs to in the sidebar.
export function getAppIdForNodeType(type: NodeType | string): AppId {
  switch (type) {
    case NodeType.MANUAL_TRIGGER:
    case NodeType.CRON_TRIGGER:
    case NodeType.WEBHOOK_TRIGGER:
    case NodeType.HTTP_REQUEST:
    case NodeType.CODE:
      return 'core';

    case NodeType.CONDITIONAL:
    case NodeType.ITERATOR:
    case NodeType.SUBWORKFLOW:
    case NodeType.RETURN:
      return 'logic';

    case NodeType.STICKY:
      return 'custom';

    case NodeType.GMAIL_SEND:
    case NodeType.GMAIL_SEARCH:
    case NodeType.GMAIL_MESSAGE_RECEIVED:
    case NodeType.GMAIL_LABEL_ADDED:
      return 'gmail';

    case NodeType.DRIVE_CREATE:
    case NodeType.DRIVE_LIST:
    case NodeType.DRIVE_FILE_ADDED:
      return 'google-drive';

    case NodeType.SHEETS_APPEND:
    case NodeType.SHEETS_READ:
    case NodeType.SHEETS_ROW_ADDED:
      return 'google-sheets';

    case NodeType.DOCS_CREATE:
      return 'google-docs';

    case NodeType.CALENDAR_CREATE:
    case NodeType.CALENDAR_EVENT_CREATED:
      return 'google-calendar';

    case NodeType.OUTLOOK_SEND:
    case NodeType.OUTLOOK_SEARCH:
    case NodeType.OUTLOOK_MESSAGE_RECEIVED:
    case NodeType.OUTLOOK_MESSAGE_FLAGGED:
      return 'outlook';

    case NodeType.EXCEL_APPEND:
    case NodeType.EXCEL_READ:
    case NodeType.EXCEL_ROW_ADDED:
      return 'excel';

    case NodeType.ONEDRIVE_CREATE:
    case NodeType.ONEDRIVE_FILE_ADDED:
      return 'onedrive';

    case NodeType.SLACK_POST_MESSAGE:
    case NodeType.SLACK_POST_TO_CHANNEL:
    case NodeType.SLACK_UPLOAD_FILE:
    case NodeType.SLACK_MESSAGE_RECEIVED:
    case NodeType.SLACK_REACTION_ADDED:
      return 'slack';

    case NodeType.DISCORD_POST_WEBHOOK:
    case NodeType.DISCORD_REPLY_TO_COMMAND:
    case NodeType.DISCORD_MESSAGE_RECEIVED:
      return 'discord';

    case NodeType.TWILIO_SEND_SMS:
    case NodeType.TWILIO_SEND_WHATSAPP:
    case NodeType.TWILIO_SMS_RECEIVED:
      return 'twilio';

    case NodeType.TELEGRAM_SEND_MESSAGE:
    case NodeType.TELEGRAM_MESSAGE_RECEIVED:
      return 'telegram';

    case NodeType.NOTION_CREATE_PAGE:
    case NodeType.NOTION_QUERY_DATABASE:
      return 'notion';

    case NodeType.TRELLO_CREATE_CARD:
    case NodeType.TRELLO_MOVE_CARD:
    case NodeType.TRELLO_ADD_COMMENT:
    case NodeType.TRELLO_UPDATE_CARD:
    case NodeType.TRELLO_CARD_CHANGED:
      return 'trello';

    case NodeType.AIRTABLE_CREATE_RECORD:
    case NodeType.AIRTABLE_UPDATE_RECORD:
    case NodeType.AIRTABLE_LIST_RECORDS:
      return 'airtable';

    case NodeType.LINEAR_CREATE_ISSUE:
    case NodeType.LINEAR_UPDATE_ISSUE_STATUS:
      return 'linear';

    case NodeType.GITHUB_CREATE_ISSUE:
    case NodeType.GITHUB_COMMENT_ISSUE:
    case NodeType.GITHUB_CREATE_PR:
      return 'github';

    case NodeType.INSTAGRAM_PUBLISH_PHOTO:
      return 'instagram';

    case NodeType.WHATSAPP_SEND_MESSAGE:
    case NodeType.WHATSAPP_SEND_TEMPLATE:
      return 'whatsapp';

    case NodeType.CLAUDE_MESSAGES:
      return 'anthropic';

    case NodeType.OPENAI_CHAT_COMPLETION:
      return 'openai';

    case NodeType.OLLAMA_GENERATE:
      return 'ollama';

    case NodeType.AI_GENERATE_IMAGE:
      return 'ai';

    case NodeType.HUBSPOT_CREATE_CONTACT:
    case NodeType.HUBSPOT_CREATE_DEAL:
    case NodeType.HUBSPOT_CONTACT_CHANGED:
      return 'hubspot';

    case NodeType.STRIPE_CREATE_CUSTOMER:
    case NodeType.STRIPE_LIST_CHARGES:
    case NodeType.STRIPE_EVENT_RECEIVED:
      return 'stripe';

    case NodeType.MAILCHIMP_ADD_SUBSCRIBER:
    case NodeType.MAILCHIMP_SEND_CAMPAIGN:
    case NodeType.MAILCHIMP_SUBSCRIBER_ADDED:
      return 'mailchimp';

    case NodeType.CALENDLY_LIST_EVENTS:
    case NodeType.CALENDLY_EVENT_SCHEDULED:
      return 'calendly';

    case NodeType.POSTGRES_RUN_QUERY:
      return 'postgres';

    case NodeType.MYSQL_RUN_QUERY:
      return 'mysql';

    case NodeType.S3_UPLOAD_FILE:
      return 's3';

    default:
      // Forward-compat: derive the app from the node-type prefix for unknown
      // entries (e.g. future SDK connectors that ship before this map is
      // updated). Falls back to 'core' for truly unrecognised types.
      return appIdFromPrefix(type);
  }
}

const PREFIX_TO_APP: ReadonlyArray<readonly [string, AppId]> = [
  ['gmail-', 'gmail'],
  ['drive-', 'google-drive'],
  ['sheets-', 'google-sheets'],
  ['docs-', 'google-docs'],
  ['calendar-', 'google-calendar'],
  ['outlook-', 'outlook'],
  ['excel-', 'excel'],
  ['onedrive-', 'onedrive'],
  ['slack-', 'slack'],
  ['discord-', 'discord'],
  ['twilio-', 'twilio'],
  ['telegram-', 'telegram'],
  ['notion-', 'notion'],
  ['trello-', 'trello'],
  ['airtable-', 'airtable'],
  ['linear-', 'linear'],
  ['github-', 'github'],
  ['instagram-', 'instagram'],
  ['whatsapp-', 'whatsapp'],
  ['claude-', 'anthropic'],
  ['anthropic-', 'anthropic'],
  ['openai-', 'openai'],
  ['ollama-', 'ollama'],
  ['ai-', 'ai'],
  ['hubspot-', 'hubspot'],
  ['stripe-', 'stripe'],
  ['mailchimp-', 'mailchimp'],
  ['calendly-', 'calendly'],
  ['postgres-', 'postgres'],
  ['mysql-', 'mysql'],
  ['s3-', 's3'],
];

function appIdFromPrefix(type: string): AppId {
  for (const [prefix, appId] of PREFIX_TO_APP) {
    if (type.startsWith(prefix)) return appId;
  }
  return 'core';
}

// Lucide fallback for sticky note and any unmapped node type — used by BrandIcon
// when an app has no `brand` entry. Kept in this file so call sites only import
// from one place.
export const DEFAULT_APP_FALLBACK_ICON: LucideIcon = Code2;

// Lucide icon for the Code node specifically (distinguishes from other Core entries).
export const CODE_NODE_ICON: LucideIcon = Code2;

export function getAppLabel(appId: AppId): string {
  return APP_INFO[appId].label;
}
