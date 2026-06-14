import { NodeCategory, NodeGroup, NodeType, type NodeTypeDefinition } from '../node-enums.js';

export const WHATSAPP_NODES: NodeTypeDefinition[] = [
  {
    type: NodeType.WHATSAPP_SEND_MESSAGE,
    name: 'WhatsApp: Send Message',
    description: 'Send a free-form text message from a WhatsApp Business number (Cloud API)',
    category: NodeCategory.ACTION,
    group: NodeGroup.COMMUNICATION,
    provider: 'whatsapp',
  },
  {
    type: NodeType.WHATSAPP_SEND_TEMPLATE,
    name: 'WhatsApp: Send Template',
    description: 'Send a pre-approved WhatsApp template message (initiate outside the 24h window)',
    category: NodeCategory.ACTION,
    group: NodeGroup.COMMUNICATION,
    provider: 'whatsapp',
  },
];
