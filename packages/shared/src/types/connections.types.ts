export const ConnectionType = {
  OAUTH2: 'OAUTH2',
  API_KEY: 'API_KEY',
  BASIC_AUTH: 'BASIC_AUTH',
  BEARER_TOKEN: 'BEARER_TOKEN',
  CUSTOM: 'CUSTOM',
} as const;

export type ConnectionType = (typeof ConnectionType)[keyof typeof ConnectionType];

export const ConnectionStatus = {
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  ERROR: 'ERROR',
  REVOKED: 'REVOKED',
} as const;

export type ConnectionStatus = (typeof ConnectionStatus)[keyof typeof ConnectionStatus];

export const ConnectionProvider = {
  GOOGLE: 'google',
  MICROSOFT: 'microsoft',
  SLACK: 'slack',
  NOTION: 'notion',
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  STRIPE: 'stripe',
  DISCORD: 'discord',
  DISCORD_BOT: 'discord-bot',
  TWILIO: 'twilio',
  TELEGRAM: 'telegram',
  TRELLO: 'trello',
  AIRTABLE: 'airtable',
  LINEAR: 'linear',
  GITHUB: 'github',
  OLLAMA: 'ollama',
  HUBSPOT: 'hubspot',
  MAILCHIMP: 'mailchimp',
  CALENDLY: 'calendly',
  POSTGRES: 'postgres',
  MYSQL: 'mysql',
  S3: 's3',
  HTTP: 'http',
} as const;

export type ConnectionProvider = (typeof ConnectionProvider)[keyof typeof ConnectionProvider];

export interface Connection {
  id: string;
  userId: string;
  type: ConnectionType;
  provider: string;
  name: string;
  status: ConnectionStatus;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
