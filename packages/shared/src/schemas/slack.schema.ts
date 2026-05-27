import { z } from 'zod';

const connectionId = z.string().uuid();
const mockOnDryRun = z.boolean().optional();

// Slack channel IDs are uppercase alphanumeric and 9–11 chars long ("C", "G", "D" prefix).
// We're permissive on length but strict on shape.
const slackChannelId = z
  .string()
  .min(2)
  .max(32)
  .regex(/^[A-Z][A-Z0-9]+$/, { message: 'channel must be a Slack channel ID (e.g. C0123ABCDEF)' });

const slackChannelName = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9_-]+$/, { message: 'channel name must be lowercase a–z, 0–9, "-" or "_"' });

const slackText = z.string().min(1).max(40_000);

// `blocks` is Slack Block Kit JSON — keep validation light (well-formed array of objects)
// since the schema upstream is large. Slack itself rejects malformed blocks at the API layer.
const slackBlocks = z.array(z.record(z.string(), z.unknown())).max(50).optional();

const slackThreadTs = z
  .string()
  .max(64)
  .regex(/^\d+\.\d+$/, { message: 'threadTs must be Slack timestamp form ("1234567890.123456")' })
  .optional();

export const slackPostMessageConfigSchema = z.object({
  connectionId,
  channel: slackChannelId,
  text: slackText,
  blocks: slackBlocks,
  threadTs: slackThreadTs,
  mockOnDryRun,
});
export type SlackPostMessageConfig = z.infer<typeof slackPostMessageConfigSchema>;

export const slackPostToChannelConfigSchema = z.object({
  connectionId,
  channelName: slackChannelName,
  text: slackText,
  blocks: slackBlocks,
  threadTs: slackThreadTs,
  mockOnDryRun,
});
export type SlackPostToChannelConfig = z.infer<typeof slackPostToChannelConfigSchema>;

// 10 MB base64 ≈ 13.3 MB string. Slack files.upload v1 caps at ~1 GB but we cap small.
const SLACK_FILE_CONTENT_MAX_LENGTH = 14_000_000;

export const slackUploadFileConfigSchema = z.object({
  connectionId,
  channel: slackChannelId,
  filename: z.string().min(1).max(255),
  contentBase64: z.string().min(1).max(SLACK_FILE_CONTENT_MAX_LENGTH),
  title: z.string().max(255).optional(),
  initialComment: z.string().max(40_000).optional(),
  mockOnDryRun,
});
export type SlackUploadFileConfig = z.infer<typeof slackUploadFileConfigSchema>;

// Read / manage actions (S15 messaging pack)

export const SLACK_USER_LOOKUP_MODES = ['email', 'name'] as const;
export type SlackUserLookupMode = (typeof SLACK_USER_LOOKUP_MODES)[number];

export const slackFindUserConfigSchema = z.object({
  connectionId,
  mode: z.enum(SLACK_USER_LOOKUP_MODES),
  // The email (mode=email) or name substring (mode=name) to search for.
  query: z.string().min(1).max(255),
  mockOnDryRun,
});
export type SlackFindUserConfig = z.infer<typeof slackFindUserConfigSchema>;

export const SLACK_SEARCH_SORTS = ['score', 'timestamp'] as const;
export type SlackSearchSort = (typeof SLACK_SEARCH_SORTS)[number];

export const slackSearchMessagesConfigSchema = z.object({
  connectionId,
  query: z.string().min(1).max(1000),
  count: z.number().int().min(1).max(100).optional(),
  sort: z.enum(SLACK_SEARCH_SORTS).optional(),
  mockOnDryRun,
});
export type SlackSearchMessagesConfig = z.infer<typeof slackSearchMessagesConfigSchema>;

export const slackAddReactionConfigSchema = z.object({
  connectionId,
  channel: slackChannelId,
  timestamp: z
    .string()
    .max(64)
    .regex(/^\d+\.\d+$/, { message: 'timestamp must be Slack ts form ("1234567890.123456")' }),
  // Emoji "name" without colons, e.g. "thumbsup".
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_+-]+$/, { message: 'name must be a Slack emoji name (e.g. thumbsup)' }),
  mockOnDryRun,
});
export type SlackAddReactionConfig = z.infer<typeof slackAddReactionConfigSchema>;

export const slackCreateChannelConfigSchema = z.object({
  connectionId,
  name: slackChannelName,
  isPrivate: z.boolean().optional(),
  mockOnDryRun,
});
export type SlackCreateChannelConfig = z.infer<typeof slackCreateChannelConfigSchema>;

export const slackInviteToChannelConfigSchema = z.object({
  connectionId,
  channel: slackChannelId,
  // Slack user IDs (e.g. U012AB3CD); accept 1–30 to invite in one call.
  users: z
    .array(
      z
        .string()
        .min(2)
        .max(32)
        .regex(/^[UW][A-Z0-9]+$/, {
          message: 'each user must be a Slack user ID (e.g. U012AB3CD)',
        }),
    )
    .min(1)
    .max(30),
  mockOnDryRun,
});
export type SlackInviteToChannelConfig = z.infer<typeof slackInviteToChannelConfigSchema>;

export const slackGetChannelHistoryConfigSchema = z.object({
  connectionId,
  channel: slackChannelId,
  limit: z.number().int().min(1).max(200).optional(),
  oldest: z.string().max(64).optional(),
  latest: z.string().max(64).optional(),
});
export type SlackGetChannelHistoryConfig = z.infer<typeof slackGetChannelHistoryConfigSchema>;

export const slackUpdateMessageConfigSchema = z.object({
  connectionId,
  channel: slackChannelId,
  ts: z
    .string()
    .max(64)
    .regex(/^\d+\.\d+$/, { message: 'ts must be Slack timestamp form ("1234567890.123456")' }),
  text: slackText,
  blocks: slackBlocks,
  mockOnDryRun,
});
export type SlackUpdateMessageConfig = z.infer<typeof slackUpdateMessageConfigSchema>;

// Trigger configs

export const SLACK_MESSAGE_EVENT_TYPES = ['message.channels', 'app_mention'] as const;
export type SlackMessageEventType = (typeof SLACK_MESSAGE_EVENT_TYPES)[number];

export const slackMessageReceivedConfigSchema = z.object({
  connectionId,
  channelId: slackChannelId.optional(),
  eventType: z.enum(SLACK_MESSAGE_EVENT_TYPES).default('message.channels'),
  // Optional substring match on the message text. Filtering happens after signature
  // verification at the worker passthrough executor level (see #199 pattern).
  keyword: z.string().max(200).optional(),
});
export type SlackMessageReceivedConfig = z.infer<typeof slackMessageReceivedConfigSchema>;

export const slackReactionAddedConfigSchema = z.object({
  connectionId,
  channelId: slackChannelId.optional(),
  emoji: z.string().min(1).max(64).optional(),
});
export type SlackReactionAddedConfig = z.infer<typeof slackReactionAddedConfigSchema>;

export const slackAppMentionConfigSchema = z.object({
  connectionId,
  channelId: slackChannelId.optional(),
});
export type SlackAppMentionConfig = z.infer<typeof slackAppMentionConfigSchema>;

export const slackChannelCreatedConfigSchema = z.object({
  connectionId,
});
export type SlackChannelCreatedConfig = z.infer<typeof slackChannelCreatedConfigSchema>;
