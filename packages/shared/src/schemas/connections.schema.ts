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
  // Slack user token (xoxp) + its granted scopes, captured only when the connection
  // opts into a user scope (search:read). search.messages requires a user token, not
  // the bot token — slack-search-messages is the sole consumer. Optional/additive so
  // existing bot-only connections remain valid.
  userAccessToken: z.string().min(1).optional(),
  userScope: z.string().optional(),
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

// Trello uses an API key + per-user token model (not OAuth1 in our flow). The key is
// the developer key from https://trello.com/app-key; the token is the user-issued
// token authorising read/write on their boards.
export const trelloApiKeyConfigSchema = z.object({
  apiKey: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/, { message: 'apiKey must be alphanumeric (Trello dev key)' }),
  token: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[A-Za-z0-9_-]+$/, { message: 'token must be a Trello user token' }),
});

// Airtable Personal Access Tokens look like "patXXXXXXXX.YYYYYYY…" (dot-delimited).
export const airtableApiKeyConfigSchema = z.object({
  apiKey: z
    .string()
    .min(1)
    .max(256)
    .regex(/^pat[A-Za-z0-9_.-]+$/, { message: 'apiKey must be an Airtable PAT (pat…)' }),
});

// Linear personal API keys are prefixed "lin_api_" per Linear docs.
export const linearApiKeyConfigSchema = z.object({
  apiKey: z
    .string()
    .min(1)
    .max(256)
    .regex(/^lin_api_[A-Za-z0-9_-]+$/, { message: 'apiKey must be a Linear API key (lin_api_…)' }),
});

// GitHub OAuth2 (OAuth App): a single non-expiring user access token (`gho_…`).
// OAuth App tokens carry no refresh token and never expire, so — unlike Google/
// Microsoft/HubSpot — there is no refreshToken/expiresAt to store (mirrors Notion).
// `scope` is the comma-separated grant returned by the token endpoint.
export const githubOAuth2ConfigSchema = z.object({
  accessToken: z.string().min(1),
  scope: z.string().optional(),
  tokenType: z.string().min(1).optional(),
});

// Instagram (Meta Graph API via Facebook Login). Stores the long-lived user
// access token; `igUserId` (the IG Business Account id, the publish target) is
// supplied per node and can be discovered later, so it is optional here.
export const instagramOAuth2ConfigSchema = z.object({
  accessToken: z.string().min(1),
  scope: z.string().optional(),
  tokenType: z.string().min(1).optional(),
  igUserId: z.string().optional(),
  pageId: z.string().optional(),
});

// WhatsApp Business (Meta Graph API via Facebook Login). Stores the long-lived
// token; `phoneNumberId` (the sending number's resource id) and `wabaId` are
// supplied per node, so optional here.
export const whatsappOAuth2ConfigSchema = z.object({
  accessToken: z.string().min(1),
  scope: z.string().optional(),
  tokenType: z.string().min(1).optional(),
  phoneNumberId: z.string().optional(),
  wabaId: z.string().optional(),
});

// Ollama: per-workspace pointer to a self-hosted Ollama server. baseUrl points at the
// server root (e.g. http://localhost:11434); the default model is the connection-level
// fallback used when the action node does not specify its own.
export const ollamaConfigSchema = z.object({
  baseUrl: z
    .string()
    .min(1)
    .max(256)
    .url({ message: 'baseUrl must be a valid URL' })
    .regex(/^https?:\/\//, { message: 'baseUrl must use http:// or https://' }),
  model: z.string().min(1).max(128),
});

// Hugging Face Inference API: a single access token (hf_...). Used by the
// AI: Generate Image node's `huggingface` provider for token-based text-to-image.
export const huggingfaceApiKeyConfigSchema = z.object({
  apiKey: z.string().min(1),
});

// HubSpot OAuth2: access + refresh token, plus the hub identifier returned by the
// token introspection endpoint so we can attribute API calls to the right portal.
export const hubspotOAuth2ConfigSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  hubId: z.string().min(1).optional(),
  scope: z.string().optional(),
  tokenType: z.string().min(1).optional(),
});

// Mailchimp Marketing API: server prefix (e.g. "us1") is required because the
// Mailchimp REST host is region-pinned (https://<dc>.api.mailchimp.com/3.0/).
// Mailchimp API keys carry a trailing "-<dc>" suffix; we accept the prefix as
// an explicit field so callers can paste the key as-is and have us derive it.
export const mailchimpApiKeyConfigSchema = z.object({
  apiKey: z.string().min(1).max(128),
  dataCenter: z
    .string()
    .min(1)
    .max(16)
    .regex(/^[a-z]{2}\d+$/, { message: 'dataCenter must be like "us1", "eu2", etc.' }),
});

// Calendly v2 uses long-lived Personal Access Tokens. No refresh.
export const calendlyApiKeyConfigSchema = z.object({
  apiKey: z.string().min(1).max(512),
});

// Postgres: full libpq-compatible connection string (postgresql:// or postgres://).
// Stored encrypted via libsodium; never logged.
const POSTGRES_URL_REGEX = /^postgres(ql)?:\/\//;
export const postgresCustomConfigSchema = z.object({
  connectionString: z.string().min(1).max(2048).regex(POSTGRES_URL_REGEX, {
    message: 'connectionString must start with postgres:// or postgresql://',
  }),
});

// MySQL: full mysql:// or mysql2:// connection string.
const MYSQL_URL_REGEX = /^mysql\d?:\/\//;
export const mysqlCustomConfigSchema = z.object({
  connectionString: z
    .string()
    .min(1)
    .max(2048)
    .regex(MYSQL_URL_REGEX, { message: 'connectionString must start with mysql:// or mysql2://' }),
});

// S3-compatible: AWS S3 plus R2/MinIO/etc. via custom endpoint URL. forcePathStyle
// is required for MinIO and some R2 setups; default false for true AWS S3.
export const s3CustomConfigSchema = z.object({
  accessKeyId: z.string().min(1).max(128),
  secretAccessKey: z.string().min(1).max(256),
  region: z.string().min(1).max(64),
  endpoint: z.string().min(1).max(512).url({ message: 'endpoint must be a valid URL' }).optional(),
  forcePathStyle: z.boolean().optional(),
});

// Generic HTTP connection: reusable auth credentials injected as request headers
// by the http-request node (used optionally — the node also runs unauthenticated).
// Discriminated on `authType` so each method only carries the fields it needs:
//   - bearer: Authorization: Bearer <token>
//   - apiKey: <headerName>: <apiKey>
//   - basic:  Authorization: Basic base64(username:password)
// Stored encrypted via libsodium like every other connection; never logged.
export const httpConnectionConfigSchema = z.discriminatedUnion('authType', [
  z.object({
    authType: z.literal('bearer'),
    token: z.string().min(1).max(4096),
  }),
  z.object({
    authType: z.literal('apiKey'),
    headerName: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9-]+$/, { message: 'headerName must be a valid HTTP header name' }),
    apiKey: z.string().min(1).max(4096),
  }),
  z.object({
    authType: z.literal('basic'),
    username: z.string().min(1).max(256),
    password: z.string().min(1).max(256),
  }),
]);

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
export type TrelloApiKeyConfig = z.infer<typeof trelloApiKeyConfigSchema>;
export type AirtableApiKeyConfig = z.infer<typeof airtableApiKeyConfigSchema>;
export type LinearApiKeyConfig = z.infer<typeof linearApiKeyConfigSchema>;
export type GitHubOAuth2Config = z.infer<typeof githubOAuth2ConfigSchema>;
export type InstagramOAuth2Config = z.infer<typeof instagramOAuth2ConfigSchema>;
export type WhatsappOAuth2Config = z.infer<typeof whatsappOAuth2ConfigSchema>;
export type OllamaConfig = z.infer<typeof ollamaConfigSchema>;
export type HuggingfaceApiKeyConfig = z.infer<typeof huggingfaceApiKeyConfigSchema>;
export type HubspotOAuth2Config = z.infer<typeof hubspotOAuth2ConfigSchema>;
export type MailchimpApiKeyConfig = z.infer<typeof mailchimpApiKeyConfigSchema>;
export type CalendlyApiKeyConfig = z.infer<typeof calendlyApiKeyConfigSchema>;
export type PostgresCustomConfig = z.infer<typeof postgresCustomConfigSchema>;
export type MysqlCustomConfig = z.infer<typeof mysqlCustomConfigSchema>;
export type S3CustomConfig = z.infer<typeof s3CustomConfigSchema>;
export type HttpConnectionConfig = z.infer<typeof httpConnectionConfigSchema>;

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
  [ConnectionProvider.TRELLO]: trelloApiKeyConfigSchema,
  [ConnectionProvider.AIRTABLE]: airtableApiKeyConfigSchema,
  [ConnectionProvider.LINEAR]: linearApiKeyConfigSchema,
  [ConnectionProvider.GITHUB]: githubOAuth2ConfigSchema,
  [ConnectionProvider.INSTAGRAM]: instagramOAuth2ConfigSchema,
  [ConnectionProvider.WHATSAPP]: whatsappOAuth2ConfigSchema,
  [ConnectionProvider.OLLAMA]: ollamaConfigSchema,
  [ConnectionProvider.HUGGINGFACE]: huggingfaceApiKeyConfigSchema,
  [ConnectionProvider.HUBSPOT]: hubspotOAuth2ConfigSchema,
  [ConnectionProvider.MAILCHIMP]: mailchimpApiKeyConfigSchema,
  [ConnectionProvider.CALENDLY]: calendlyApiKeyConfigSchema,
  [ConnectionProvider.POSTGRES]: postgresCustomConfigSchema,
  [ConnectionProvider.MYSQL]: mysqlCustomConfigSchema,
  [ConnectionProvider.S3]: s3CustomConfigSchema,
  [ConnectionProvider.HTTP]: httpConnectionConfigSchema,
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
  trello: TrelloApiKeyConfig;
  airtable: AirtableApiKeyConfig;
  linear: LinearApiKeyConfig;
  github: GitHubOAuth2Config;
  instagram: InstagramOAuth2Config;
  whatsapp: WhatsappOAuth2Config;
  ollama: OllamaConfig;
  huggingface: HuggingfaceApiKeyConfig;
  hubspot: HubspotOAuth2Config;
  mailchimp: MailchimpApiKeyConfig;
  calendly: CalendlyApiKeyConfig;
  postgres: PostgresCustomConfig;
  mysql: MysqlCustomConfig;
  s3: S3CustomConfig;
  http: HttpConnectionConfig;
};
