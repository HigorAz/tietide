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
] as const;

export const getProviderEntry = (provider: string): ProviderEntry | undefined =>
  PROVIDER_CATALOG.find((p) => p.id === provider);

export const getProviderLabel = (provider: string): string =>
  getProviderEntry(provider)?.label ?? provider;

export const getProviderIcon = (provider: string): string | undefined =>
  getProviderEntry(provider)?.iconUrl;
