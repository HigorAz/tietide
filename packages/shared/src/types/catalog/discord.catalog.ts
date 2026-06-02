import { NodeCategory, NodeGroup, NodeType, type NodeTypeDefinition } from '../node-enums.js';

export const DISCORD_NODES: NodeTypeDefinition[] = [
  {
    type: NodeType.DISCORD_POST_WEBHOOK,
    name: 'Discord: Post via Webhook',
    description: 'Send a message to a Discord channel via its incoming webhook URL',
    category: NodeCategory.ACTION,
    group: NodeGroup.COMMUNICATION,
    provider: 'discord',
  },
  {
    type: NodeType.DISCORD_REPLY_TO_COMMAND,
    name: 'Discord: Reply to Slash Command',
    description: 'Reply to the Discord slash command that triggered this workflow with a message',
    category: NodeCategory.ACTION,
    group: NodeGroup.COMMUNICATION,
    provider: 'discord',
  },
  {
    type: NodeType.DISCORD_BOT_SEND_MESSAGE,
    name: 'Discord: Send Message (Bot)',
    description: 'Post a message to a Discord channel using a bot token (REST API)',
    category: NodeCategory.ACTION,
    group: NodeGroup.COMMUNICATION,
    provider: 'discord-bot',
  },
  {
    type: NodeType.DISCORD_GET_CHANNEL_MESSAGES,
    name: 'Discord: Get Channel Messages',
    description: 'Read recent messages from a Discord channel using a bot token',
    category: NodeCategory.ACTION,
    group: NodeGroup.COMMUNICATION,
    provider: 'discord-bot',
  },
  {
    type: NodeType.DISCORD_ADD_ROLE,
    name: 'Discord: Add Role',
    description: 'Assign a role to a guild member using a bot token',
    category: NodeCategory.ACTION,
    group: NodeGroup.COMMUNICATION,
    provider: 'discord-bot',
  },
  {
    type: NodeType.DISCORD_MESSAGE_RECEIVED,
    name: 'Discord: Slash Command Received',
    description:
      'Trigger on a Discord slash command invocation (push, Interactions endpoint, ed25519)',
    category: NodeCategory.TRIGGER,
    group: NodeGroup.COMMUNICATION_TRIGGERS,
    provider: 'discord-bot',
  },
];
