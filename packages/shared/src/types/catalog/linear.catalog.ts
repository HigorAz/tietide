import { NodeCategory, NodeGroup, NodeType, type NodeTypeDefinition } from '../node-enums.js';

export const LINEAR_NODES: NodeTypeDefinition[] = [
  {
    type: NodeType.LINEAR_CREATE_ISSUE,
    name: 'Linear: Create Issue',
    description: 'Create a Linear issue in a team',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'linear',
  },
  {
    type: NodeType.LINEAR_UPDATE_ISSUE_STATUS,
    name: 'Linear: Update Issue Status',
    description: 'Move a Linear issue to a different workflow state',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'linear',
  },
  {
    type: NodeType.LINEAR_GET_ISSUE,
    name: 'Linear: Get Issue',
    description: 'Fetch a Linear issue by ID',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'linear',
  },
  {
    type: NodeType.LINEAR_SEARCH_ISSUES,
    name: 'Linear: Search Issues',
    description: 'Search Linear issues by title text',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'linear',
  },
  {
    type: NodeType.LINEAR_ADD_COMMENT,
    name: 'Linear: Add Comment',
    description: 'Add a comment to a Linear issue',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'linear',
  },
  {
    type: NodeType.LINEAR_ISSUE_UPDATED,
    name: 'Linear: Issue Updated',
    description: 'Trigger when a Linear issue is created or updated (poll, updatedAt cursor)',
    category: NodeCategory.TRIGGER,
    group: NodeGroup.PRODUCTIVITY_TRIGGERS,
    provider: 'linear',
  },
];
