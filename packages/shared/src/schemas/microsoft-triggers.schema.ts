import { z } from 'zod';
import { NodeType } from '../types/node.types.js';

const connectionId = z.string().uuid();

// MS Graph $filter expression length cap. The full URL containing the filter is
// limited to ~2000 chars by Graph; 1024 leaves headroom for the resource path.
const graphFilterExpression = z
  .string()
  .min(1)
  .max(1024)
  .refine((v) => !/[\r\n]/.test(v), { message: 'filter must not contain newlines' });

// OneDrive folder paths must not contain ".." traversal or trailing slashes.
const onedriveFolderPath = z
  .string()
  .min(1)
  .max(512)
  .refine((v) => !v.includes('..'), { message: 'folderPath must not contain ".."' })
  .refine((v) => !/[\r\n]/.test(v), { message: 'folderPath must not contain newlines' });

// Excel workbook IDs are OneDrive driveItem IDs (alphanumeric + a few symbols).
const driveItemId = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9!_\-.]+$/, {
    message: 'workbookId must be a OneDrive driveItem id (alphanumeric + ! _ - .)',
  });

// Excel worksheet and table names are user-supplied. Strip control chars; cap
// length conservatively. Graph URL-encodes them so we don't need to be strict
// about quotes etc.
const excelLabel = (label: string, max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((v) => !/[\r\n]/.test(v), { message: `${label} must not contain newlines` });

export const outlookMessageReceivedConfigSchema = z.object({
  connectionId,
  filter: graphFilterExpression.optional(),
});
export type OutlookMessageReceivedConfig = z.infer<typeof outlookMessageReceivedConfigSchema>;

export const outlookMessageFlaggedConfigSchema = z.object({
  connectionId,
  // The flagged trigger pre-applies $filter=flag/flagStatus eq 'flagged'; an
  // optional extra filter is AND-merged at activation time.
  filter: graphFilterExpression.optional(),
});
export type OutlookMessageFlaggedConfig = z.infer<typeof outlookMessageFlaggedConfigSchema>;

export const onedriveFileAddedConfigSchema = z.object({
  connectionId,
  folderPath: onedriveFolderPath.optional(),
});
export type OnedriveFileAddedConfig = z.infer<typeof onedriveFileAddedConfigSchema>;

export const excelRowAddedConfigSchema = z.object({
  connectionId,
  workbookId: driveItemId,
  worksheet: excelLabel('worksheet', 255),
  tableName: excelLabel('tableName', 255).default('Table1'),
  intervalSeconds: z.number().int().positive().max(3600).optional(),
});
export type ExcelRowAddedConfig = z.infer<typeof excelRowAddedConfigSchema>;

// Same shape as excel-row-added; the difference is the cursor strategy (per-row
// value hash map) so the trigger fires on CHANGES to existing rows, not inserts.
export const excelRowUpdatedConfigSchema = z.object({
  connectionId,
  workbookId: driveItemId,
  worksheet: excelLabel('worksheet', 255),
  tableName: excelLabel('tableName', 255).default('Table1'),
  intervalSeconds: z.number().int().positive().max(3600).optional(),
});
export type ExcelRowUpdatedConfig = z.infer<typeof excelRowUpdatedConfigSchema>;

// Required Microsoft Graph delegated scope for each trigger. Mirrors
// GOOGLE_TRIGGER_REQUIRED_SCOPES so the SPA's ScopeReauthBanner surfaces
// missing-scope hints uniformly.
export const MICROSOFT_TRIGGER_REQUIRED_SCOPES: Readonly<Record<string, string>> = {
  [NodeType.OUTLOOK_MESSAGE_RECEIVED]: 'Mail.Read',
  [NodeType.OUTLOOK_MESSAGE_FLAGGED]: 'Mail.Read',
  [NodeType.ONEDRIVE_FILE_ADDED]: 'Files.Read',
  [NodeType.EXCEL_ROW_ADDED]: 'Files.Read',
  [NodeType.EXCEL_ROW_UPDATED]: 'Files.Read',
};
