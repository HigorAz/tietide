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

export const gmailMessageReceivedConfigSchema = z
  .object({
    connectionId,
    mode: z.enum(['push', 'poll']).default('poll'),
    topicName: pubsubTopicName.optional(),
    query: z.string().max(2048).optional(),
    labelIds: z.array(z.string().min(1).max(128)).max(20).optional(),
    intervalSeconds: z.number().int().positive().max(3600).optional(),
  })
  .refine((v) => v.mode !== 'push' || typeof v.topicName === 'string', {
    message: 'topicName is required when mode is "push"',
    path: ['topicName'],
  });
export type GmailMessageReceivedConfig = z.infer<typeof gmailMessageReceivedConfigSchema>;

export const gmailLabelAddedConfigSchema = z.object({
  connectionId,
  labelId: z.string().min(1).max(128),
  query: z.string().max(2048).optional(),
  intervalSeconds: z.number().int().positive().max(3600).optional(),
});
export type GmailLabelAddedConfig = z.infer<typeof gmailLabelAddedConfigSchema>;

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

export const GOOGLE_TRIGGER_REQUIRED_SCOPES: Readonly<Record<string, string>> = {
  [NodeType.GMAIL_MESSAGE_RECEIVED]: 'https://www.googleapis.com/auth/gmail.readonly',
  [NodeType.GMAIL_LABEL_ADDED]: 'https://www.googleapis.com/auth/gmail.readonly',
  [NodeType.DRIVE_FILE_ADDED]: 'https://www.googleapis.com/auth/drive.readonly',
  [NodeType.SHEETS_ROW_ADDED]: 'https://www.googleapis.com/auth/spreadsheets.readonly',
  [NodeType.CALENDAR_EVENT_CREATED]: 'https://www.googleapis.com/auth/calendar.readonly',
};
