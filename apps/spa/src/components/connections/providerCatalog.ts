import { ConnectionProvider, ConnectionType } from '@tietide/shared';
import googleIcon from '@/assets/providers/google.svg';
import microsoftIcon from '@/assets/providers/microsoft.svg';
import slackIcon from '@/assets/providers/slack.svg';
import notionIcon from '@/assets/providers/notion.svg';
import openaiIcon from '@/assets/providers/openai.svg';
import anthropicIcon from '@/assets/providers/anthropic.svg';
import ollamaIcon from '@/assets/providers/ollama.svg';
import huggingfaceIcon from '@/assets/providers/huggingface.svg';
import discordIcon from '@/assets/providers/discord.svg';
import twilioIcon from '@/assets/providers/twilio.svg';
import telegramIcon from '@/assets/providers/telegram.svg';
import trelloIcon from '@/assets/providers/trello.svg';
import airtableIcon from '@/assets/providers/airtable.svg';
import linearIcon from '@/assets/providers/linear.svg';
import githubIcon from '@/assets/providers/github.svg';
import hubspotIcon from '@/assets/providers/hubspot.svg';
import stripeIcon from '@/assets/providers/stripe.svg';
import mailchimpIcon from '@/assets/providers/mailchimp.svg';
import calendlyIcon from '@/assets/providers/calendly.svg';
import postgresIcon from '@/assets/providers/postgres.svg';
import mysqlIcon from '@/assets/providers/mysql.svg';
import s3Icon from '@/assets/providers/s3.svg';
import httpIcon from '@/assets/providers/http.svg';

export interface ProviderEntry {
  id: ConnectionProvider;
  label: string;
  type: ConnectionType;
  iconUrl: string;
  // Repo-relative path to a setup guide for this provider, e.g.
  // 'docs/oauth-google-setup.md'. Combined with VITE_DOCS_BASE_URL at render
  // time to produce a clickable link. Omit to hide the link for a provider.
  setupGuidePath?: string;
}

export const PROVIDER_CATALOG: readonly ProviderEntry[] = [
  {
    id: ConnectionProvider.GOOGLE,
    label: 'Google',
    type: ConnectionType.OAUTH2,
    iconUrl: googleIcon,
    setupGuidePath: 'docs/Connection-setup/oauth-google-setup.md',
  },
  {
    id: ConnectionProvider.MICROSOFT,
    label: 'Microsoft',
    type: ConnectionType.OAUTH2,
    iconUrl: microsoftIcon,
    setupGuidePath: 'docs/Connection-setup/oauth-microsoft-setup.md',
  },
  {
    id: ConnectionProvider.SLACK,
    label: 'Slack',
    type: ConnectionType.OAUTH2,
    iconUrl: slackIcon,
    setupGuidePath: 'docs/Connection-setup/oauth-slack-setup.md',
  },
  {
    id: ConnectionProvider.NOTION,
    label: 'Notion',
    type: ConnectionType.OAUTH2,
    iconUrl: notionIcon,
    setupGuidePath: 'docs/Connection-setup/oauth-notion-setup.md',
  },
  {
    id: ConnectionProvider.OPENAI,
    label: 'OpenAI',
    type: ConnectionType.API_KEY,
    iconUrl: openaiIcon,
  },
  {
    id: ConnectionProvider.ANTHROPIC,
    label: 'Anthropic',
    type: ConnectionType.API_KEY,
    iconUrl: anthropicIcon,
  },
  {
    id: ConnectionProvider.OLLAMA,
    label: 'Ollama',
    type: ConnectionType.CUSTOM,
    iconUrl: ollamaIcon,
    setupGuidePath: 'docs/Connection-setup/connection-ollama-setup.md',
  },
  {
    id: ConnectionProvider.HUGGINGFACE,
    label: 'Hugging Face',
    type: ConnectionType.API_KEY,
    iconUrl: huggingfaceIcon,
  },
  {
    id: ConnectionProvider.DISCORD,
    label: 'Discord (Webhook)',
    type: ConnectionType.CUSTOM,
    iconUrl: discordIcon,
    setupGuidePath: 'docs/Connection-setup/connection-discord-setup.md',
  },
  {
    id: ConnectionProvider.DISCORD_BOT,
    label: 'Discord (Bot)',
    type: ConnectionType.CUSTOM,
    iconUrl: discordIcon,
    setupGuidePath: 'docs/Connection-setup/connection-discord-setup.md',
  },
  {
    id: ConnectionProvider.TWILIO,
    label: 'Twilio',
    type: ConnectionType.API_KEY,
    iconUrl: twilioIcon,
  },
  {
    id: ConnectionProvider.TELEGRAM,
    label: 'Telegram',
    type: ConnectionType.API_KEY,
    iconUrl: telegramIcon,
    setupGuidePath: 'docs/Connection-setup/connection-telegram-setup.md',
  },
  {
    id: ConnectionProvider.TRELLO,
    label: 'Trello',
    type: ConnectionType.API_KEY,
    iconUrl: trelloIcon,
    setupGuidePath: 'docs/Connection-setup/connection-trello-setup.md',
  },
  {
    id: ConnectionProvider.AIRTABLE,
    label: 'Airtable',
    type: ConnectionType.API_KEY,
    iconUrl: airtableIcon,
    setupGuidePath: 'docs/Connection-setup/connection-airtable-setup.md',
  },
  {
    id: ConnectionProvider.LINEAR,
    label: 'Linear',
    type: ConnectionType.API_KEY,
    iconUrl: linearIcon,
    setupGuidePath: 'docs/Connection-setup/connection-linear-setup.md',
  },
  {
    id: ConnectionProvider.GITHUB,
    label: 'GitHub',
    type: ConnectionType.OAUTH2,
    iconUrl: githubIcon,
    setupGuidePath: 'docs/Connection-setup/oauth-github-setup.md',
  },
  {
    id: ConnectionProvider.HUBSPOT,
    label: 'HubSpot',
    type: ConnectionType.OAUTH2,
    iconUrl: hubspotIcon,
    setupGuidePath: 'docs/Connection-setup/oauth-hubspot-setup.md',
  },
  {
    id: ConnectionProvider.STRIPE,
    label: 'Stripe',
    type: ConnectionType.API_KEY,
    iconUrl: stripeIcon,
    setupGuidePath: 'docs/Connection-setup/connection-stripe-setup.md',
  },
  {
    id: ConnectionProvider.MAILCHIMP,
    label: 'Mailchimp',
    type: ConnectionType.API_KEY,
    iconUrl: mailchimpIcon,
    setupGuidePath: 'docs/Connection-setup/connection-mailchimp-setup.md',
  },
  {
    id: ConnectionProvider.CALENDLY,
    label: 'Calendly',
    type: ConnectionType.API_KEY,
    iconUrl: calendlyIcon,
    setupGuidePath: 'docs/Connection-setup/connection-calendly-setup.md',
  },
  {
    id: ConnectionProvider.POSTGRES,
    label: 'Postgres',
    type: ConnectionType.CUSTOM,
    iconUrl: postgresIcon,
  },
  {
    id: ConnectionProvider.MYSQL,
    label: 'MySQL',
    type: ConnectionType.CUSTOM,
    iconUrl: mysqlIcon,
  },
  {
    id: ConnectionProvider.S3,
    label: 'S3 / R2 / MinIO',
    type: ConnectionType.CUSTOM,
    iconUrl: s3Icon,
  },
  {
    id: ConnectionProvider.HTTP,
    label: 'HTTP',
    type: ConnectionType.CUSTOM,
    iconUrl: httpIcon,
  },
] as const;

export const getProviderEntry = (provider: string): ProviderEntry | undefined =>
  PROVIDER_CATALOG.find((p) => p.id === provider);

export const getProviderLabel = (provider: string): string =>
  getProviderEntry(provider)?.label ?? provider;

export const getProviderIcon = (provider: string): string | undefined =>
  getProviderEntry(provider)?.iconUrl;

export const getProviderSetupGuidePath = (provider: string): string | undefined =>
  getProviderEntry(provider)?.setupGuidePath;
