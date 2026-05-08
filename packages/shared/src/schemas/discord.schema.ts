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
