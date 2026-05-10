import { ConnectionProvider, ConnectionType } from '@tietide/shared';
import googleIcon from '@/assets/providers/google.svg';
import microsoftIcon from '@/assets/providers/microsoft.svg';
import slackIcon from '@/assets/providers/slack.svg';
import notionIcon from '@/assets/providers/notion.svg';
import openaiIcon from '@/assets/providers/openai.svg';
import anthropicIcon from '@/assets/providers/anthropic.svg';
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

export interface ProviderEntry {
  id: ConnectionProvider;
  label: string;
  type: ConnectionType;
  iconUrl: string;
}

export const PROVIDER_CATALOG: readonly ProviderEntry[] = [
  {
    id: ConnectionProvider.GOOGLE,
    label: 'Google',
    type: ConnectionType.OAUTH2,
    iconUrl: googleIcon,
  },
  {
    id: ConnectionProvider.MICROSOFT,
    label: 'Microsoft',
    type: ConnectionType.OAUTH2,
    iconUrl: microsoftIcon,
  },
  {
    id: ConnectionProvider.SLACK,
    label: 'Slack',
    type: ConnectionType.OAUTH2,
    iconUrl: slackIcon,
  },
  {
    id: ConnectionProvider.NOTION,
    label: 'Notion',
    type: ConnectionType.OAUTH2,
    iconUrl: notionIcon,
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
    id: ConnectionProvider.DISCORD,
    label: 'Discord (Webhook)',
    type: ConnectionType.CUSTOM,
    iconUrl: discordIcon,
  },
  {
    id: ConnectionProvider.DISCORD_BOT,
    label: 'Discord (Bot)',
    type: ConnectionType.CUSTOM,
    iconUrl: discordIcon,
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
  },
  {
    id: ConnectionProvider.TRELLO,
    label: 'Trello',
    type: ConnectionType.API_KEY,
    iconUrl: trelloIcon,
  },
  {
    id: ConnectionProvider.AIRTABLE,
    label: 'Airtable',
    type: ConnectionType.API_KEY,
    iconUrl: airtableIcon,
  },
  {
    id: ConnectionProvider.LINEAR,
    label: 'Linear',
    type: ConnectionType.API_KEY,
    iconUrl: linearIcon,
  },
  {
    id: ConnectionProvider.GITHUB,
    label: 'GitHub',
    type: ConnectionType.API_KEY,
    iconUrl: githubIcon,
  },
  {
    id: ConnectionProvider.HUBSPOT,
    label: 'HubSpot',
    type: ConnectionType.OAUTH2,
    iconUrl: hubspotIcon,
  },
  {
    id: ConnectionProvider.STRIPE,
    label: 'Stripe',
    type: ConnectionType.API_KEY,
    iconUrl: stripeIcon,
  },
  {
    id: ConnectionProvider.MAILCHIMP,
    label: 'Mailchimp',
    type: ConnectionType.API_KEY,
    iconUrl: mailchimpIcon,
  },
  {
    id: ConnectionProvider.CALENDLY,
    label: 'Calendly',
    type: ConnectionType.API_KEY,
    iconUrl: calendlyIcon,
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
] as const;

export const getProviderEntry = (provider: string): ProviderEntry | undefined =>
  PROVIDER_CATALOG.find((p) => p.id === provider);

export const getProviderLabel = (provider: string): string =>
  getProviderEntry(provider)?.label ?? provider;

export const getProviderIcon = (provider: string): string | undefined =>
  getProviderEntry(provider)?.iconUrl;
