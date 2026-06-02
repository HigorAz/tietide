import { NodeCategory, NodeGroup, NodeType, type NodeTypeDefinition } from '../node-enums.js';

export const TRELLO_NODES: NodeTypeDefinition[] = [
  {
    type: NodeType.TRELLO_CREATE_CARD,
    name: 'Trello: Create Card',
    description: 'Create a Trello card on a board list',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'trello',
  },
  {
    type: NodeType.TRELLO_MOVE_CARD,
    name: 'Trello: Move Card',
    description: 'Move an existing Trello card to a different list',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'trello',
  },
  {
    type: NodeType.TRELLO_ADD_COMMENT,
    name: 'Trello: Add Comment',
    description: 'Post a comment on an existing Trello card',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'trello',
  },
  {
    type: NodeType.TRELLO_UPDATE_CARD,
    name: 'Trello: Update Card',
    description:
      'Update fields (name, description, due, list, archived) on an existing Trello card',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'trello',
  },
  {
    type: NodeType.TRELLO_GET_CARD,
    name: 'Trello: Get Card',
    description: 'Fetch a Trello card by ID',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'trello',
  },
  {
    type: NodeType.TRELLO_LIST_CARDS,
    name: 'Trello: List Cards',
    description: 'List cards on a Trello board or list',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'trello',
  },
  {
    type: NodeType.TRELLO_CREATE_LIST,
    name: 'Trello: Create List',
    description: 'Create a new list on a Trello board',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'trello',
  },
  {
    type: NodeType.TRELLO_CARD_CHANGED,
    name: 'Trello: Card Changed',
    description: 'Trigger on Trello board events (create / update / comment / member changes)',
    category: NodeCategory.TRIGGER,
    group: NodeGroup.COMMERCE_TRIGGERS,
    provider: 'trello',
  },
];
