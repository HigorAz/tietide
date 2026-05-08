import { z } from 'zod';
import { ConnectionProvider } from '../types/connections.types.js';

export const googleOAuth2ConfigSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  scope: z.string(),
  tokenType: z.string().min(1),
});

export const microsoftOAuth2ConfigSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  scope: z.string(),
  tokenType: z.string().min(1),
  tenantId: z.string().optional(),
});

export const slackOAuth2ConfigSchema = z.object({
  accessToken: z.string().min(1),
  teamId: z.string().min(1),
  botUserId: z.string().min(1),
  scope: z.string(),
  // Slack App signing secret (separate from OAuth token; pasted by user after install).
  // Required to verify inbound Slack Events API requests for slack-message-received /
  // slack-reaction-added triggers. Optional so connections work for actions only.
  signingSecret: z.string().min(1).optional(),
});

export const notionOAuth2ConfigSchema = z.object({
  accessToken: z.string().min(1),
  workspaceId: z.string().min(1),
  workspaceName: z.string().optional(),
  botId: z.string().optional(),
});

export const openAIApiKeyConfigSchema = z.object({
  apiKey: z.string().min(1),
  organization: z.string().optional(),
});

export const anthropicApiKeyConfigSchema = z.object({
  apiKey: z.string().min(1),
});

export const stripeApiKeyConfigSchema = z.object({
  apiKey: z.string().min(1),
  accountId: z.string().optional(),
});

// Discord channel webhook URL — Discord puts the auth token in the URL itself.
// Validated against Discord's documented webhook URL pattern at the boundary so
// arbitrary URLs cannot be accepted by mistake (defense in depth alongside the
// per-action URL re-check before each POST).
export const DISCORD_WEBHOOK_URL_REGEX =
  /^https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/;
export const discordWebhookConfigSchema = z.object({
  webhookUrl: z
    .string()
    .min(1)
    .max(500)
    .regex(DISCORD_WEBHOOK_URL_REGEX, { message: 'Must be a Discord webhook URL' }),
});

// Discord application credentials for the Interactions endpoint trigger.
// applicationId/publicKey come from the Discord Developer Portal app page;
// botToken is required to register the slash command via the REST API.
export const discordBotConfigSchema = z.object({
  applicationId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^\d+$/, { message: 'applicationId must be a numeric Discord snowflake' }),
  publicKey: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[0-9a-fA-F]+$/, { message: 'publicKey must be a hex-encoded ed25519 key' }),
  botToken: z.string().min(1).max(256),
});

export const twilioApiKeyConfigSchema = z.object({
  accountSid: z
    .string()
    .min(1)
    .max(64)
    // Twilio Account SIDs are documented as AC + 32 hex chars; we accept
    // AC + 32 alphanumerics with optional dashes/underscores so test fixtures
    // can carry non-secret-scanner-matching placeholders.
    .regex(/^AC[A-Za-z0-9_-]{32}$/, { message: 'accountSid must be a Twilio AC… SID' }),
  authToken: z.string().min(1).max(256),
});

export const telegramBotTokenConfigSchema = z.object({
  // Telegram bot tokens are formatted as "<bot_id>:<secret>" (e.g. "123456789:ABC-...").
  botToken: z
    .string()
    .min(1)
    .max(256)
    .regex(/^\d+:[\w-]+$/, { message: 'botToken must be in the form <bot_id>:<secret>' }),
});

export type GoogleOAuth2Config = z.infer<typeof googleOAuth2ConfigSchema>;
export type MicrosoftOAuth2Config = z.infer<typeof microsoftOAuth2ConfigSchema>;
export type SlackOAuth2Config = z.infer<typeof slackOAuth2ConfigSchema>;
export type NotionOAuth2Config = z.infer<typeof notionOAuth2ConfigSchema>;
export type OpenAIApiKeyConfig = z.infer<typeof openAIApiKeyConfigSchema>;
export type AnthropicApiKeyConfig = z.infer<typeof anthropicApiKeyConfigSchema>;
export type StripeApiKeyConfig = z.infer<typeof stripeApiKeyConfigSchema>;
export type DiscordWebhookConfig = z.infer<typeof discordWebhookConfigSchema>;
export type DiscordBotConfig = z.infer<typeof discordBotConfigSchema>;
export type TwilioApiKeyConfig = z.infer<typeof twilioApiKeyConfigSchema>;
export type TelegramBotTokenConfig = z.infer<typeof telegramBotTokenConfigSchema>;

export const PROVIDER_CONFIG_SCHEMAS = {
  [ConnectionProvider.GOOGLE]: googleOAuth2ConfigSchema,
  [ConnectionProvider.MICROSOFT]: microsoftOAuth2ConfigSchema,
  [ConnectionProvider.SLACK]: slackOAuth2ConfigSchema,
  [ConnectionProvider.NOTION]: notionOAuth2ConfigSchema,
  [ConnectionProvider.OPENAI]: openAIApiKeyConfigSchema,
  [ConnectionProvider.ANTHROPIC]: anthropicApiKeyConfigSchema,
  [ConnectionProvider.STRIPE]: stripeApiKeyConfigSchema,
  [ConnectionProvider.DISCORD]: discordWebhookConfigSchema,
  [ConnectionProvider.DISCORD_BOT]: discordBotConfigSchema,
  [ConnectionProvider.TWILIO]: twilioApiKeyConfigSchema,
  [ConnectionProvider.TELEGRAM]: telegramBotTokenConfigSchema,
} as const;

export type ProviderConfigMap = {
  google: GoogleOAuth2Config;
  microsoft: MicrosoftOAuth2Config;
  slack: SlackOAuth2Config;
  notion: NotionOAuth2Config;
  openai: OpenAIApiKeyConfig;
  anthropic: AnthropicApiKeyConfig;
  stripe: StripeApiKeyConfig;
  discord: DiscordWebhookConfig;
  'discord-bot': DiscordBotConfig;
  twilio: TwilioApiKeyConfig;
  telegram: TelegramBotTokenConfig;
};
