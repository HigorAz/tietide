import { z } from 'zod';
import { NodeType } from '../types/node.types.js';

// CR/LF in any header value enables RFC 822 header injection. Reject upstream.
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
const DRIVE_CONTENT_MAX_LENGTH = 14_000_000;

export const gmailSendConfigSchema = z.object({
  connectionId: z.string().uuid(),
  to: headerString(),
  subject: headerString(),
  body: z.string().min(1).max(1_000_000),
  cc: optionalHeaderString(),
  bcc: optionalHeaderString(),
  attachments: z
    .array(
      z.object({
        filename: z.string().min(1).max(255).refine(noControlChars, {
          message: 'filename must not contain newlines',
        }),
        contentBase64: z.string().min(1).max(DRIVE_CONTENT_MAX_LENGTH),
        mimeType: z.string().min(1).max(255).refine(noControlChars, {
          message: 'mimeType must not contain newlines',
        }),
      }),
    )
    .max(10)
    .optional(),
  mockOnDryRun,
});
export type GmailSendConfig = z.infer<typeof gmailSendConfigSchema>;

export const gmailSearchConfigSchema = z.object({
  connectionId: z.string().uuid(),
  query: z.string().min(1).max(2048),
  maxResults: z.number().int().positive().max(500).optional(),
  mockOnDryRun,
});
export type GmailSearchConfig = z.infer<typeof gmailSearchConfigSchema>;

export const gmailGetMessageConfigSchema = z.object({
  connectionId: z.string().uuid(),
  messageId: z.string().min(1).max(128),
  mockOnDryRun,
});
export type GmailGetMessageConfig = z.infer<typeof gmailGetMessageConfigSchema>;

// Gmail attachment IDs are long base64url tokens, well beyond a normal message
// ID. filename/mimeType are echoed from the caller (usually mapped from a
// gmail-get-message attachments[] entry) since attachments.get returns only
// the raw data + size.
export const gmailGetAttachmentConfigSchema = z.object({
  connectionId: z.string().uuid(),
  messageId: z.string().min(1).max(128),
  attachmentId: z.string().min(1).max(4096),
  filename: z.string().max(255).optional(),
  mimeType: z.string().max(255).optional(),
  mockOnDryRun,
});
export type GmailGetAttachmentConfig = z.infer<typeof gmailGetAttachmentConfigSchema>;

const labelId = z.string().min(1).max(128);
export const gmailModifyLabelsConfigSchema = z
  .object({
    connectionId: z.string().uuid(),
    messageId: z.string().min(1).max(128),
    addLabelIds: z.array(labelId).max(100).optional(),
    removeLabelIds: z.array(labelId).max(100).optional(),
    // Convenience flags layered onto the label deltas: archive → remove INBOX,
    // markRead → remove UNREAD, markUnread → add UNREAD.
    archive: z.boolean().optional(),
    markRead: z.boolean().optional(),
    markUnread: z.boolean().optional(),
    mockOnDryRun,
  })
  .refine((v) => !(v.markRead && v.markUnread), {
    message: 'markRead and markUnread are mutually exclusive',
    path: ['markUnread'],
  })
  .refine(
    (v) =>
      (v.addLabelIds?.length ?? 0) > 0 ||
      (v.removeLabelIds?.length ?? 0) > 0 ||
      v.archive === true ||
      v.markRead === true ||
      v.markUnread === true,
    { message: 'Specify at least one label change', path: ['addLabelIds'] },
  );
export type GmailModifyLabelsConfig = z.infer<typeof gmailModifyLabelsConfigSchema>;

export const gmailCreateDraftConfigSchema = z.object({
  connectionId: z.string().uuid(),
  to: headerString(),
  subject: headerString(),
  body: z.string().min(1).max(1_000_000),
  cc: optionalHeaderString(),
  bcc: optionalHeaderString(),
  // Set to thread an existing conversation as a reply draft.
  threadId: z.string().min(1).max(128).optional(),
  mockOnDryRun,
});
export type GmailCreateDraftConfig = z.infer<typeof gmailCreateDraftConfigSchema>;

export const driveCreateConfigSchema = z.object({
  connectionId: z.string().uuid(),
  name: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  content: z.string().max(DRIVE_CONTENT_MAX_LENGTH),
  parentFolderId: z.string().min(1).max(128).optional(),
  mockOnDryRun,
});
export type DriveCreateConfig = z.infer<typeof driveCreateConfigSchema>;

export const driveListConfigSchema = z.object({
  connectionId: z.string().uuid(),
  folderId: z.string().min(1).max(128),
  query: z.string().max(2048).optional(),
  maxResults: z.number().int().positive().max(1000).optional(),
  mockOnDryRun,
});
export type DriveListConfig = z.infer<typeof driveListConfigSchema>;

export const sheetsAppendConfigSchema = z.object({
  connectionId: z.string().uuid(),
  spreadsheetId: z.string().min(1).max(128),
  sheet: z.string().min(1).max(255),
  values: z.array(z.array(z.unknown())).min(1),
  mockOnDryRun,
});
export type SheetsAppendConfig = z.infer<typeof sheetsAppendConfigSchema>;

export const sheetsReadConfigSchema = z.object({
  connectionId: z.string().uuid(),
  spreadsheetId: z.string().min(1).max(128),
  range: z.string().min(1).max(255),
  mockOnDryRun,
});
export type SheetsReadConfig = z.infer<typeof sheetsReadConfigSchema>;

// Look up rows where a column equals a value. The Sheets API has no
// server-side query, so the worker reads the range and filters in memory;
// scanning is capped (see SheetsFindRow action) and reported via `truncated`.
// `column` is a header name (requires hasHeaderRow) or a 0-based column index.
export const sheetsFindRowConfigSchema = z.object({
  connectionId: z.string().uuid(),
  spreadsheetId: z.string().min(1).max(128),
  range: z.string().min(1).max(255),
  column: z.union([z.string().min(1).max(255), z.number().int().min(0).max(1000)]),
  value: z.string().max(10_000),
  hasHeaderRow: z.boolean().optional(),
  firstMatchOnly: z.boolean().optional(),
  mockOnDryRun,
});
export type SheetsFindRowConfig = z.infer<typeof sheetsFindRowConfigSchema>;

export const sheetsUpdateRowConfigSchema = z.object({
  connectionId: z.string().uuid(),
  spreadsheetId: z.string().min(1).max(128),
  sheet: z.string().min(1).max(255),
  rowNumber: z.number().int().positive(),
  values: z.array(z.unknown()).min(1),
  mockOnDryRun,
});
export type SheetsUpdateRowConfig = z.infer<typeof sheetsUpdateRowConfigSchema>;

export const sheetsClearRangeConfigSchema = z.object({
  connectionId: z.string().uuid(),
  spreadsheetId: z.string().min(1).max(128),
  range: z.string().min(1).max(255),
  mockOnDryRun,
});
export type SheetsClearRangeConfig = z.infer<typeof sheetsClearRangeConfigSchema>;

export const docsGetConfigSchema = z.object({
  connectionId: z.string().uuid(),
  documentId: z.string().min(1).max(128),
  mockOnDryRun,
});
export type DocsGetConfig = z.infer<typeof docsGetConfigSchema>;

// Docs body content starts at index 1 (index 0 is the document start and is not
// a valid insertion point). Omit `index` to append at the end of the body.
export const docsInsertTextConfigSchema = z.object({
  connectionId: z.string().uuid(),
  documentId: z.string().min(1).max(128),
  text: z.string().min(1).max(100_000),
  index: z.number().int().min(1).optional(),
  mockOnDryRun,
});
export type DocsInsertTextConfig = z.infer<typeof docsInsertTextConfigSchema>;

// Find-and-replace text tokens (template fill). A token with no occurrences in
// the document is a no-op (occurrencesChanged 0), not an error.
export const docsReplaceTextConfigSchema = z.object({
  connectionId: z.string().uuid(),
  documentId: z.string().min(1).max(128),
  replacements: z
    .record(z.string().min(1).max(255), z.string().max(10_000))
    .refine((r) => Object.keys(r).length > 0, { message: 'Provide at least one replacement' }),
  matchCase: z.boolean().optional(),
  mockOnDryRun,
});
export type DocsReplaceTextConfig = z.infer<typeof docsReplaceTextConfigSchema>;

export const docsCreateConfigSchema = z.object({
  connectionId: z.string().uuid(),
  templateId: z.string().min(1).max(128),
  replacements: z.record(z.string(), z.string().max(10_000)),
  mockOnDryRun,
});
export type DocsCreateConfig = z.infer<typeof docsCreateConfigSchema>;

export const calendarCreateConfigSchema = z
  .object({
    connectionId: z.string().uuid(),
    calendarId: z.string().min(1).max(255).default('primary'),
    summary: headerString(255),
    description: z.string().max(8192).optional(),
    start: z.string().datetime(),
    end: z.string().datetime(),
    attendees: z.array(z.string().email()).max(100).optional(),
    mockOnDryRun,
  })
  .refine((v) => new Date(v.start).getTime() < new Date(v.end).getTime(), {
    message: 'end must be after start',
    path: ['end'],
  });
export type CalendarCreateConfig = z.infer<typeof calendarCreateConfigSchema>;

// Map of Google node types to the OAuth scope each requires. Consumed by the
// SPA's ScopeReauthBanner and by `BaseConnectorAction.run()` validation if the
// worker wants to short-circuit before hitting the API.
export const GOOGLE_NODE_REQUIRED_SCOPES: Readonly<Record<string, string>> = {
  [NodeType.GMAIL_SEND]: 'https://www.googleapis.com/auth/gmail.send',
  [NodeType.GMAIL_SEARCH]: 'https://www.googleapis.com/auth/gmail.readonly',
  [NodeType.GMAIL_GET_MESSAGE]: 'https://www.googleapis.com/auth/gmail.readonly',
  [NodeType.GMAIL_GET_ATTACHMENT]: 'https://www.googleapis.com/auth/gmail.readonly',
  [NodeType.GMAIL_MODIFY_LABELS]: 'https://www.googleapis.com/auth/gmail.modify',
  [NodeType.GMAIL_CREATE_DRAFT]: 'https://www.googleapis.com/auth/gmail.modify',
  [NodeType.DRIVE_CREATE]: 'https://www.googleapis.com/auth/drive.file',
  [NodeType.DRIVE_LIST]: 'https://www.googleapis.com/auth/drive.readonly',
  [NodeType.SHEETS_APPEND]: 'https://www.googleapis.com/auth/spreadsheets',
  [NodeType.SHEETS_READ]: 'https://www.googleapis.com/auth/spreadsheets.readonly',
  [NodeType.SHEETS_FIND_ROW]: 'https://www.googleapis.com/auth/spreadsheets.readonly',
  [NodeType.SHEETS_UPDATE_ROW]: 'https://www.googleapis.com/auth/spreadsheets',
  [NodeType.SHEETS_CLEAR_RANGE]: 'https://www.googleapis.com/auth/spreadsheets',
  [NodeType.DOCS_CREATE]: 'https://www.googleapis.com/auth/documents',
  [NodeType.DOCS_GET]: 'https://www.googleapis.com/auth/documents.readonly',
  [NodeType.DOCS_INSERT_TEXT]: 'https://www.googleapis.com/auth/documents',
  [NodeType.DOCS_REPLACE_TEXT]: 'https://www.googleapis.com/auth/documents',
  [NodeType.CALENDAR_CREATE]: 'https://www.googleapis.com/auth/calendar.events',
};

export const GOOGLE_NODE_TYPES: ReadonlyArray<string> = Object.keys(GOOGLE_NODE_REQUIRED_SCOPES);
