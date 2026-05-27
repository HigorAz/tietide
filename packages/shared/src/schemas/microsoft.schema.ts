import { z } from 'zod';
import { NodeType } from '../types/node.types.js';

const noControlChars = (s: string) => !/[\r\n]/.test(s);
const headerString = (max = 998) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine(noControlChars, { message: 'Must not contain newline characters' });

const optionalHeaderString = (max = 998) =>
  z
    .string()
    .max(max)
    .refine(noControlChars, { message: 'Must not contain newline characters' })
    .optional();

const mockOnDryRun = z.boolean().optional();

// ~10 MB base64 ≈ 13.3 MB string. Capped at the boundary.
const ONEDRIVE_CONTENT_MAX_LENGTH = 14_000_000;

// A1 notation: e.g. 'A1', 'A1:C12', 'AA10:AB20'. Anchored to prevent injection
// of slashes / parens / quotes that could rewrite a Graph URL path segment.
const a1RangePattern = /^[A-Z]+\d+(?::[A-Z]+\d+)?$/;

// OneDrive item names cannot contain path separators or traversal sequences;
// these would let a user write to a folder they don't intend.
const onedriveItemNamePattern = /^[^\\/]+$/;

// Graph resource IDs (message / attachment / driveItem). Long, URL-unsafe
// base64-ish strings — the action encodeURIComponent()s them into the path, so
// here we only reject control chars and cap the length.
const graphId = (max = 512) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((v) => !/[\r\n]/.test(v), { message: 'must not contain newline characters' });

export const outlookSendConfigSchema = z.object({
  connectionId: z.string().uuid(),
  to: headerString(),
  subject: headerString(255),
  body: z.string().min(1).max(1_000_000),
  cc: optionalHeaderString(),
  bcc: optionalHeaderString(),
  isHtml: z.boolean().optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string().min(1).max(255).refine(noControlChars, {
          message: 'filename must not contain newlines',
        }),
        contentBase64: z.string().min(1).max(ONEDRIVE_CONTENT_MAX_LENGTH),
        mimeType: z.string().min(1).max(255).refine(noControlChars, {
          message: 'mimeType must not contain newlines',
        }),
      }),
    )
    .max(10)
    .optional(),
  mockOnDryRun,
});
export type OutlookSendConfig = z.infer<typeof outlookSendConfigSchema>;

export const outlookSearchConfigSchema = z.object({
  connectionId: z.string().uuid(),
  query: z.string().min(1).max(500),
  maxResults: z.number().int().positive().max(50).optional(),
  mockOnDryRun,
});
export type OutlookSearchConfig = z.infer<typeof outlookSearchConfigSchema>;

export const excelAppendConfigSchema = z.object({
  connectionId: z.string().uuid(),
  workbookId: z.string().min(1).max(128),
  worksheet: z.string().min(1).max(255),
  values: z.array(z.array(z.unknown()).max(100)).min(1).max(1000),
  mockOnDryRun,
});
export type ExcelAppendConfig = z.infer<typeof excelAppendConfigSchema>;

export const excelReadConfigSchema = z.object({
  connectionId: z.string().uuid(),
  workbookId: z.string().min(1).max(128),
  worksheet: z.string().min(1).max(255),
  range: z
    .string()
    .min(1)
    .max(64)
    .refine((v) => a1RangePattern.test(v), {
      message: 'range must be A1 notation (e.g. "A1" or "A1:C10")',
    }),
  mockOnDryRun,
});
export type ExcelReadConfig = z.infer<typeof excelReadConfigSchema>;

export const onedriveCreateConfigSchema = z.object({
  connectionId: z.string().uuid(),
  name: z
    .string()
    .min(1)
    .max(255)
    .refine((v) => onedriveItemNamePattern.test(v) && !v.includes('..'), {
      message: 'name must not contain path separators or ".."',
    }),
  mimeType: z.string().min(1).max(255).refine(noControlChars, {
    message: 'mimeType must not contain newlines',
  }),
  contentBase64: z.string().min(1).max(ONEDRIVE_CONTENT_MAX_LENGTH),
  parentFolderId: z.string().min(1).max(128).optional(),
  mockOnDryRun,
});
export type OnedriveCreateConfig = z.infer<typeof onedriveCreateConfigSchema>;

export const outlookGetMessageConfigSchema = z.object({
  connectionId: z.string().uuid(),
  messageId: graphId(),
  mockOnDryRun,
});
export type OutlookGetMessageConfig = z.infer<typeof outlookGetMessageConfigSchema>;

export const outlookGetAttachmentConfigSchema = z.object({
  connectionId: z.string().uuid(),
  messageId: graphId(),
  attachmentId: graphId(),
  mockOnDryRun,
});
export type OutlookGetAttachmentConfig = z.infer<typeof outlookGetAttachmentConfigSchema>;

export const outlookUpdateMessageConfigSchema = z
  .object({
    connectionId: z.string().uuid(),
    messageId: graphId(),
    flagStatus: z.enum(['flagged', 'complete', 'notFlagged']).optional(),
    categories: z.array(z.string().min(1).max(255)).max(25).optional(),
    markRead: z.boolean().optional(),
    markUnread: z.boolean().optional(),
    // Destination mailFolder id or a well-known name (e.g. 'archive', 'inbox').
    moveToFolderId: graphId(255).optional(),
    mockOnDryRun,
  })
  .refine((v) => !(v.markRead && v.markUnread), {
    message: 'markRead and markUnread are mutually exclusive',
    path: ['markUnread'],
  })
  .refine(
    (v) =>
      v.flagStatus !== undefined ||
      (v.categories?.length ?? 0) > 0 ||
      v.markRead === true ||
      v.markUnread === true ||
      v.moveToFolderId !== undefined,
    {
      message: 'Specify at least one update (flag, categories, read state, or move)',
      path: ['flagStatus'],
    },
  );
export type OutlookUpdateMessageConfig = z.infer<typeof outlookUpdateMessageConfigSchema>;

// Map of Microsoft node types to the OAuth scope each requires. Mirrors
// GOOGLE_NODE_REQUIRED_SCOPES so the SPA's ScopeReauthBanner can surface
// missing-scope hints uniformly.
export const MICROSOFT_NODE_REQUIRED_SCOPES: Readonly<Record<string, string>> = {
  [NodeType.OUTLOOK_SEND]: 'Mail.Send',
  [NodeType.OUTLOOK_SEARCH]: 'Mail.Read',
  [NodeType.OUTLOOK_GET_MESSAGE]: 'Mail.Read',
  [NodeType.OUTLOOK_GET_ATTACHMENT]: 'Mail.Read',
  [NodeType.OUTLOOK_UPDATE_MESSAGE]: 'Mail.ReadWrite',
  [NodeType.EXCEL_APPEND]: 'Files.ReadWrite',
  [NodeType.EXCEL_READ]: 'Files.Read',
  [NodeType.ONEDRIVE_CREATE]: 'Files.ReadWrite',
};

export const MICROSOFT_NODE_TYPES: ReadonlyArray<string> = Object.keys(
  MICROSOFT_NODE_REQUIRED_SCOPES,
);
