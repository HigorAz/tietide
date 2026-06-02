import { NodeCategory, NodeGroup, NodeType, type NodeTypeDefinition } from '../node-enums.js';

export const TELEGRAM_NODES: NodeTypeDefinition[] = [
  {
    type: NodeType.TELEGRAM_SEND_MESSAGE,
    name: 'Telegram: Send Message',
    description: 'Send a message via a Telegram bot to a chat or channel',
    category: NodeCategory.ACTION,
    group: NodeGroup.COMMUNICATION,
    provider: 'telegram',
  },
  {
    type: NodeType.TELEGRAM_SEND_PHOTO,
    name: 'Telegram: Send Photo',
    description: 'Send a photo to a Telegram chat by URL, file_id, or base64 upload',
    category: NodeCategory.ACTION,
    group: NodeGroup.COMMUNICATION,
    provider: 'telegram',
  },
  {
    type: NodeType.TELEGRAM_SEND_DOCUMENT,
    name: 'Telegram: Send Document',
    description: 'Send a document to a Telegram chat by URL, file_id, or base64 upload',
    category: NodeCategory.ACTION,
    group: NodeGroup.COMMUNICATION,
    provider: 'telegram',
  },
  {
    type: NodeType.TELEGRAM_EDIT_MESSAGE,
    name: 'Telegram: Edit Message',
    description: 'Edit the text of a previously sent Telegram message',
    category: NodeCategory.ACTION,
    group: NodeGroup.COMMUNICATION,
    provider: 'telegram',
  },
  {
    type: NodeType.TELEGRAM_GET_CHAT,
    name: 'Telegram: Get Chat',
    description: 'Fetch metadata about a Telegram chat (getChat)',
    category: NodeCategory.ACTION,
    group: NodeGroup.COMMUNICATION,
    provider: 'telegram',
  },
  {
    type: NodeType.TELEGRAM_MESSAGE_RECEIVED,
    name: 'Telegram: Message Received',
    description: 'Trigger when a Telegram bot receives a message (push, setWebhook + secret_token)',
    category: NodeCategory.TRIGGER,
    group: NodeGroup.COMMUNICATION_TRIGGERS,
    provider: 'telegram',
  },
  {
    type: NodeType.TELEGRAM_CALLBACK_QUERY_RECEIVED,
    name: 'Telegram: Callback Query Received',
    description:
      'Trigger when a Telegram inline-keyboard button is pressed (push, setWebhook + secret_token)',
    category: NodeCategory.TRIGGER,
    group: NodeGroup.COMMUNICATION_TRIGGERS,
    provider: 'telegram',
  },
];
