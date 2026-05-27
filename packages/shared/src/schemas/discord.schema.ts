import { z } from 'zod';

const connectionId = z.string().uuid();
const mockOnDryRun = z.boolean().optional();

// Discord embeds are open-ended. Keep loose validation; Discord rejects malformed embeds.
const discordEmbed = z.record(z.string(), z.unknown());

export const discordPostWebhookConfigSchema = z.object({
  connectionId,
  content: z.string().min(1).max(2000),
  username: z.string().min(1).max(80).optional(),
  avatarUrl: z.string().url().max(500).optional(),
  embeds: z.array(discordEmbed).max(10).optional(),
  mockOnDryRun,
});
export type DiscordPostWebhookConfig = z.infer<typeof discordPostWebhookConfigSchema>;

// Trigger config — Discord Interactions endpoint fires on a registered slash command.
// commandName matches the Discord command name (lowercase, 1–32 chars, dash/underscore).
const discordCommandName = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9_-]+$/, {
    message: 'commandName must be lowercase a–z, 0–9, "-" or "_"',
  });

export const discordMessageReceivedConfigSchema = z.object({
  connectionId,
  commandName: discordCommandName.default('tietide-trigger'),
  // Optional Discord guild (server) snowflake. When present, the registered slash command
  // is scoped to that guild only. When absent the command is registered globally (which
  // can take up to 1 hour to propagate per Discord's cache).
  guildId: z
    .string()
    .max(32)
    .regex(/^\d+$/, { message: 'guildId must be a Discord snowflake' })
    .optional(),
});
export type DiscordMessageReceivedConfig = z.infer<typeof discordMessageReceivedConfigSchema>;

// Action config — reply to the slash-command interaction that triggered the workflow.
// The interaction token + application id flow in from the trigger node's output, so both
// are optional here; they can be overridden with data-pill templates (e.g. {{trigger.token}})
// for advanced graphs where this action is not directly downstream of the trigger.
export const discordReplyToCommandConfigSchema = z.object({
  content: z.string().min(1).max(2000),
  interactionToken: z.string().min(1).max(2000).optional(),
  applicationId: z
    .string()
    .max(64)
    .regex(/^\d+$/, { message: 'applicationId must be a Discord snowflake' })
    .optional(),
  mockOnDryRun,
});
export type DiscordReplyToCommandConfig = z.infer<typeof discordReplyToCommandConfigSchema>;

// Bot-token REST actions (S15 messaging pack). These use the `discord-bot`
// connection (bot token) and the Discord REST API — distinct from the
// webhook-URL post action above.
const discordSnowflake = z
  .string()
  .min(1)
  .max(32)
  .regex(/^\d+$/, { message: 'must be a Discord snowflake (numeric id)' });

export const discordBotSendMessageConfigSchema = z.object({
  connectionId,
  channelId: discordSnowflake,
  content: z.string().min(1).max(2000),
  embeds: z.array(discordEmbed).max(10).optional(),
  mockOnDryRun,
});
export type DiscordBotSendMessageConfig = z.infer<typeof discordBotSendMessageConfigSchema>;

export const discordGetChannelMessagesConfigSchema = z.object({
  connectionId,
  channelId: discordSnowflake,
  limit: z.number().int().min(1).max(100).optional(),
});
export type DiscordGetChannelMessagesConfig = z.infer<typeof discordGetChannelMessagesConfigSchema>;

export const discordAddRoleConfigSchema = z.object({
  connectionId,
  guildId: discordSnowflake,
  userId: discordSnowflake,
  roleId: discordSnowflake,
  mockOnDryRun,
});
export type DiscordAddRoleConfig = z.infer<typeof discordAddRoleConfigSchema>;
