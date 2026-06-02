import { NodeCategory, NodeGroup, NodeType, type NodeTypeDefinition } from '../node-enums.js';

export const CALENDLY_NODES: NodeTypeDefinition[] = [
  {
    type: NodeType.CALENDLY_LIST_EVENTS,
    name: 'Calendly: List Scheduled Events',
    description: 'List Calendly events for a user, optionally within a time range',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'calendly',
  },
  {
    type: NodeType.CALENDLY_EVENT_SCHEDULED,
    name: 'Calendly: Event Scheduled',
    description: 'Trigger when a Calendly invitee schedules or cancels an event (HMAC-SHA256)',
    category: NodeCategory.TRIGGER,
    group: NodeGroup.COMMERCE_TRIGGERS,
    provider: 'calendly',
  },
  {
    type: NodeType.CALENDLY_GET_EVENT,
    name: 'Calendly: Get Event',
    description: 'Fetch a Calendly scheduled event by UUID',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'calendly',
  },
  {
    type: NodeType.CALENDLY_CANCEL_EVENT,
    name: 'Calendly: Cancel Event',
    description: 'Cancel a Calendly scheduled event by UUID',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'calendly',
  },
  {
    type: NodeType.CALENDLY_LIST_INVITEES,
    name: 'Calendly: List Invitees',
    description: 'List invitees for a Calendly scheduled event',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'calendly',
  },
];
