import { NodeCategory, NodeGroup, NodeType, type NodeTypeDefinition } from '../node-enums.js';

export const S3_NODES: NodeTypeDefinition[] = [
  {
    type: NodeType.S3_UPLOAD_FILE,
    name: 'S3: Upload File',
    description: 'Upload an object to S3 / R2 / MinIO (streams large content via multipart)',
    category: NodeCategory.ACTION,
    group: NodeGroup.DATA,
    provider: 's3',
  },
  {
    type: NodeType.S3_DOWNLOAD_FILE,
    name: 'S3: Download File',
    description: 'Download an object from S3 / R2 / MinIO (returns base64 content)',
    category: NodeCategory.ACTION,
    group: NodeGroup.DATA,
    provider: 's3',
  },
  {
    type: NodeType.S3_LIST_OBJECTS,
    name: 'S3: List Objects',
    description: 'List objects in an S3 bucket by prefix (paginated via continuation token)',
    category: NodeCategory.ACTION,
    group: NodeGroup.DATA,
    provider: 's3',
  },
  {
    type: NodeType.S3_DELETE_OBJECT,
    name: 'S3: Delete Object',
    description: 'Delete an object from an S3 bucket',
    category: NodeCategory.ACTION,
    group: NodeGroup.DATA,
    provider: 's3',
  },
  {
    type: NodeType.S3_GET_PRESIGNED_URL,
    name: 'S3: Get Presigned URL',
    description: 'Generate a time-limited signed GET or PUT URL for an S3 object',
    category: NodeCategory.ACTION,
    group: NodeGroup.DATA,
    provider: 's3',
  },
  {
    type: NodeType.S3_OBJECT_CREATED,
    name: 'S3: Object Created',
    description: 'Trigger when a new object appears under an S3 bucket/prefix (poll, list-objects)',
    category: NodeCategory.TRIGGER,
    group: NodeGroup.COMMERCE_TRIGGERS,
    provider: 's3',
  },
];
