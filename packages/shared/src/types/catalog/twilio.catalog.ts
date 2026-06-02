import { NodeCategory, NodeGroup, NodeType, type NodeTypeDefinition } from '../node-enums.js';

export const TWILIO_NODES: NodeTypeDefinition[] = [
  {
    type: NodeType.TWILIO_SEND_SMS,
    name: 'Twilio: Send SMS',
    description: 'Send an SMS via Twilio to an E.164 number',
    category: NodeCategory.ACTION,
    group: NodeGroup.COMMUNICATION,
    provider: 'twilio',
  },
  {
    type: NodeType.TWILIO_SEND_WHATSAPP,
    name: 'Twilio: Send WhatsApp Template',
    description: 'Send a Twilio WhatsApp message using an approved Content template',
    category: NodeCategory.ACTION,
    group: NodeGroup.COMMUNICATION,
    provider: 'twilio',
  },
  {
    type: NodeType.TWILIO_GET_MESSAGE,
    name: 'Twilio: Get Message',
    description: 'Fetch a Twilio message and its delivery status by SID',
    category: NodeCategory.ACTION,
    group: NodeGroup.COMMUNICATION,
    provider: 'twilio',
  },
  {
    type: NodeType.TWILIO_LIST_MESSAGES,
    name: 'Twilio: List Messages',
    description: 'List recent Twilio messages, optionally filtered by to/from',
    category: NodeCategory.ACTION,
    group: NodeGroup.COMMUNICATION,
    provider: 'twilio',
  },
  {
    type: NodeType.TWILIO_MAKE_CALL,
    name: 'Twilio: Make Call',
    description: 'Place an outbound voice call via Twilio using a TwiML URL or inline TwiML',
    category: NodeCategory.ACTION,
    group: NodeGroup.COMMUNICATION,
    provider: 'twilio',
  },
  {
    type: NodeType.TWILIO_SMS_RECEIVED,
    name: 'Twilio: SMS Received',
    description: 'Trigger when a Twilio phone number receives an SMS (push, X-Twilio-Signature)',
    category: NodeCategory.TRIGGER,
    group: NodeGroup.COMMUNICATION_TRIGGERS,
    provider: 'twilio',
  },
];
