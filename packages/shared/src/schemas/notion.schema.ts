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
