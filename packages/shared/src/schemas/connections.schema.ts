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

export type GoogleOAuth2Config = z.infer<typeof googleOAuth2ConfigSchema>;
export type MicrosoftOAuth2Config = z.infer<typeof microsoftOAuth2ConfigSchema>;
export type SlackOAuth2Config = z.infer<typeof slackOAuth2ConfigSchema>;
export type NotionOAuth2Config = z.infer<typeof notionOAuth2ConfigSchema>;
export type OpenAIApiKeyConfig = z.infer<typeof openAIApiKeyConfigSchema>;
export type AnthropicApiKeyConfig = z.infer<typeof anthropicApiKeyConfigSchema>;

export const PROVIDER_CONFIG_SCHEMAS = {
  [ConnectionProvider.GOOGLE]: googleOAuth2ConfigSchema,
  [ConnectionProvider.MICROSOFT]: microsoftOAuth2ConfigSchema,
  [ConnectionProvider.SLACK]: slackOAuth2ConfigSchema,
  [ConnectionProvider.NOTION]: notionOAuth2ConfigSchema,
  [ConnectionProvider.OPENAI]: openAIApiKeyConfigSchema,
  [ConnectionProvider.ANTHROPIC]: anthropicApiKeyConfigSchema,
} as const;

export type ProviderConfigMap = {
  google: GoogleOAuth2Config;
  microsoft: MicrosoftOAuth2Config;
  slack: SlackOAuth2Config;
  notion: NotionOAuth2Config;
  openai: OpenAIApiKeyConfig;
  anthropic: AnthropicApiKeyConfig;
};
