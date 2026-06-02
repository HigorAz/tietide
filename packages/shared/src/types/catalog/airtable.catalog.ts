import { NodeCategory, NodeGroup, NodeType, type NodeTypeDefinition } from '../node-enums.js';

export const AIRTABLE_NODES: NodeTypeDefinition[] = [
  {
    type: NodeType.AIRTABLE_CREATE_RECORD,
    name: 'Airtable: Create Record',
    description: 'Create a record in an Airtable table',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'airtable',
  },
  {
    type: NodeType.AIRTABLE_UPDATE_RECORD,
    name: 'Airtable: Update Record',
    description: 'Patch fields on an existing Airtable record',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'airtable',
  },
  {
    type: NodeType.AIRTABLE_LIST_RECORDS,
    name: 'Airtable: List Records',
    description: 'List records from an Airtable table with optional filterByFormula',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'airtable',
  },
  {
    type: NodeType.AIRTABLE_GET_RECORD,
    name: 'Airtable: Get Record',
    description: 'Fetch a single Airtable record by ID',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'airtable',
  },
  {
    type: NodeType.AIRTABLE_FIND_RECORDS,
    name: 'Airtable: Find Records',
    description: 'Find Airtable records matching a filterByFormula expression',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'airtable',
  },
  {
    type: NodeType.AIRTABLE_DELETE_RECORD,
    name: 'Airtable: Delete Record',
    description: 'Delete a single Airtable record by ID',
    category: NodeCategory.ACTION,
    group: NodeGroup.PRODUCTIVITY,
    provider: 'airtable',
  },
  {
    type: NodeType.AIRTABLE_RECORD_CREATED,
    name: 'Airtable: Record Created',
    description:
      'Trigger when a new record is added to an Airtable table (poll, createdTime cursor)',
    category: NodeCategory.TRIGGER,
    group: NodeGroup.PRODUCTIVITY_TRIGGERS,
    provider: 'airtable',
  },
];
