import { z } from 'zod';
import { NodeType } from '../types/node.types.js';

const connectionId = z.string().uuid();

// Gmail topicName format: projects/<project-id>/topics/<topic-name>
const pubsubTopicName = z
  .string()
  .min(1)
  .max(512)
  .regex(/^projects\/[a-z0-9-]+\/topics\/[a-zA-Z0-9._\-+%~]+$/, {
    message: 'topicName must be in the form projects/<project-id>/topics/<topic-name>',
  });

// Push-only for #199. Pub/Sub topic must be provisioned upstream — see
// docs/deployment.md. For label-based polling without GCP setup users
// should pick the `gmail-label-added` trigger instead.
export const gmailMessageReceivedConfigSchema = z.object({
  connectionId,
  topicName: pubsubTopicName,
  labelIds: z.array(z.string().min(1).max(128)).max(20).optional(),
  labelFilterAction: z.enum(['include', 'exclude']).optional(),
});
export type GmailMessageReceivedConfig = z.infer<typeof gmailMessageReceivedConfigSchema>;

export const gmailLabelAddedConfigSchema = z.object({
  connectionId,
  labelId: z.string().min(1).max(128),
  query: z.string().max(2048).optional(),
  intervalSeconds: z.number().int().positive().max(3600).optional(),
});
export type GmailLabelAddedConfig = z.infer<typeof gmailLabelAddedConfigSchema>;

export const gmailAttachmentReceivedConfigSchema = z.object({
  connectionId,
  intervalSeconds: z.number().int().positive().max(3600).optional(),
});
export type GmailAttachmentReceivedConfig = z.infer<typeof gmailAttachmentReceivedConfigSchema>;

export const driveFileAddedConfigSchema = z.object({
  connectionId,
  parentFolderId: z.string().min(1).max(128),
  mimeType: z.string().max(255).optional(),
});
export type DriveFileAddedConfig = z.infer<typeof driveFileAddedConfigSchema>;

export const sheetsRowAddedConfigSchema = z.object({
  connectionId,
  spreadsheetId: z.string().min(1).max(128),
  range: z.string().min(1).max(255),
  intervalSeconds: z.number().int().positive().max(3600).optional(),
});
export type SheetsRowAddedConfig = z.infer<typeof sheetsRowAddedConfigSchema>;

export const calendarEventCreatedConfigSchema = z.object({
  connectionId,
  calendarId: z.string().min(1).max(255).default('primary'),
  intervalSeconds: z.number().int().positive().max(3600).optional(),
});
export type CalendarEventCreatedConfig = z.infer<typeof calendarEventCreatedConfigSchema>;

export const calendarEventUpdatedConfigSchema = z.object({
  connectionId,
  calendarId: z.string().min(1).max(255).default('primary'),
  intervalSeconds: z.number().int().positive().max(3600).optional(),
});
export type CalendarEventUpdatedConfig = z.infer<typeof calendarEventUpdatedConfigSchema>;

export const GOOGLE_TRIGGER_REQUIRED_SCOPES: Readonly<Record<string, string>> = {
  [NodeType.GMAIL_MESSAGE_RECEIVED]: 'https://www.googleapis.com/auth/gmail.readonly',
  [NodeType.GMAIL_LABEL_ADDED]: 'https://www.googleapis.com/auth/gmail.readonly',
  [NodeType.GMAIL_ATTACHMENT_RECEIVED]: 'https://www.googleapis.com/auth/gmail.readonly',
  [NodeType.DRIVE_FILE_ADDED]: 'https://www.googleapis.com/auth/drive.readonly',
  [NodeType.SHEETS_ROW_ADDED]: 'https://www.googleapis.com/auth/spreadsheets.readonly',
  [NodeType.CALENDAR_EVENT_CREATED]: 'https://www.googleapis.com/auth/calendar.readonly',
  [NodeType.CALENDAR_EVENT_UPDATED]: 'https://www.googleapis.com/auth/calendar.readonly',
};
