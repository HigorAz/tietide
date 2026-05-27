import { z } from 'zod';

const connectionId = z.string().uuid();
const mockOnDryRun = z.boolean().optional();

// Notion IDs are 32 hex chars, often shown with dashes (UUID-style); accept both
// since the Notion API normalises either form.
const notionId = z
  .string()
  .min(32)
  .max(36)
  .regex(/^[0-9a-fA-F]{32}$|^[0-9a-fA-F-]{36}$/, {
    message: 'must be a 32-char or UUID-formatted Notion ID',
  });

// Notion property values are user-supplied opaque payloads (titles, rich-text,
// numbers, selects, dates…). The Notion API itself validates them, so we keep
// validation light at the boundary.
const notionProperties = z
  .record(z.string().min(1).max(200), z.unknown())
  .refine((v) => Object.keys(v).length <= 100, { message: 'too many properties (>100)' });

// Block children are an array of Notion block objects (max 100 per Notion docs).
const notionBlocks = z.array(z.record(z.string(), z.unknown())).max(100).optional();

export const notionCreatePageConfigSchema = z.object({
  connectionId,
  parentDatabaseId: notionId,
  properties: notionProperties,
  children: notionBlocks,
  mockOnDryRun,
});
export type NotionCreatePageConfig = z.infer<typeof notionCreatePageConfigSchema>;

// Notion query database — filter and sorts are opaque JSON payloads per the
// Notion API spec. We allow plain objects and bound the page size.
export const notionQueryDatabaseConfigSchema = z.object({
  connectionId,
  databaseId: notionId,
  filter: z.record(z.string(), z.unknown()).optional(),
  sorts: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  startCursor: z.string().min(1).max(200).optional(),
});
export type NotionQueryDatabaseConfig = z.infer<typeof notionQueryDatabaseConfigSchema>;

export const notionGetPageConfigSchema = z.object({
  connectionId,
  pageId: notionId,
});
export type NotionGetPageConfig = z.infer<typeof notionGetPageConfigSchema>;

// Update accepts a properties patch and/or an archived flag — at least one is
// required so the node always does something.
export const notionUpdatePageConfigSchema = z
  .object({
    connectionId,
    pageId: notionId,
    properties: notionProperties.optional(),
    archived: z.boolean().optional(),
    mockOnDryRun,
  })
  .refine((v) => v.properties !== undefined || v.archived !== undefined, {
    message: 'provide properties to update and/or an archived flag',
  });
export type NotionUpdatePageConfig = z.infer<typeof notionUpdatePageConfigSchema>;

// Append requires at least one block. Notion caps a single append at 100 blocks.
const notionBlocksRequired = z.array(z.record(z.string(), z.unknown())).min(1).max(100);

export const notionAppendBlocksConfigSchema = z.object({
  connectionId,
  blockId: notionId,
  children: notionBlocksRequired,
  mockOnDryRun,
});
export type NotionAppendBlocksConfig = z.infer<typeof notionAppendBlocksConfigSchema>;

export const notionGetBlockChildrenConfigSchema = z.object({
  connectionId,
  blockId: notionId,
  pageSize: z.number().int().min(1).max(100).optional(),
  startCursor: z.string().min(1).max(200).optional(),
});
export type NotionGetBlockChildrenConfig = z.infer<typeof notionGetBlockChildrenConfigSchema>;

// Find returns the first row of a filtered database query (a convenience over
// notion-query-database for lookup-then-act flows).
export const notionFindDatabaseItemConfigSchema = z.object({
  connectionId,
  databaseId: notionId,
  filter: z.record(z.string(), z.unknown()).optional(),
  sorts: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
});
export type NotionFindDatabaseItemConfig = z.infer<typeof notionFindDatabaseItemConfigSchema>;

// Poll trigger — fires when a database row's last_edited_time advances.
export const notionDatabaseItemUpdatedConfigSchema = z.object({
  connectionId,
  databaseId: notionId,
  intervalSeconds: z.number().int().positive().max(3600).optional(),
});
export type NotionDatabaseItemUpdatedConfig = z.infer<typeof notionDatabaseItemUpdatedConfigSchema>;
