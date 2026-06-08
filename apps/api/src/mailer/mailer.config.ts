// Pure, unit-testable resolution of mail configuration from the environment.
// Kept free of NestJS so it can be tested in isolation (mirrors security.config.ts).

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
}

export interface MailConfig {
  from: string;
  // Base URL of the SPA, used to build the verification link the user clicks.
  appUrl: string;
  // SMTP transport config. Undefined → the log transport is used (dev/tests, or
  // any environment where SMTP is not configured) so registration never breaks.
  smtp?: SmtpConfig;
}

export const DEFAULT_MAIL_FROM = 'TieTide <no-reply@tietide.local>';
export const DEFAULT_APP_URL = 'http://localhost:5173';

type Env = Record<string, string | undefined>;

const stripTrailingSlashes = (url: string): string => url.replace(/\/+$/, '');

export function resolveMailConfig(env: Env): MailConfig {
  // APP_URL is the SPA origin; fall back to the first CORS origin, then to dev.
  const rawAppUrl =
    env.APP_URL?.trim() || env.CORS_ORIGIN?.split(',')[0]?.trim() || DEFAULT_APP_URL;
  const appUrl = stripTrailingSlashes(rawAppUrl);
  const from = env.SMTP_FROM?.trim() || DEFAULT_MAIL_FROM;

  const host = env.SMTP_HOST?.trim();
  if (!host) {
    return { from, appUrl };
  }

  const parsedPort = Number(env.SMTP_PORT);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 587;
  const secure = env.SMTP_SECURE === 'true' || port === 465;
  const user = env.SMTP_USER?.trim() || undefined;
  const pass = env.SMTP_PASS || undefined;

  return { from, appUrl, smtp: { host, port, secure, user, pass } };
}

export function buildVerificationUrl(appUrl: string, token: string): string {
  return `${stripTrailingSlashes(appUrl)}/verify-email?token=${encodeURIComponent(token)}`;
}

export function buildPasswordResetUrl(appUrl: string, token: string): string {
  return `${stripTrailingSlashes(appUrl)}/reset-password?token=${encodeURIComponent(token)}`;
}

export function buildInviteUrl(appUrl: string, token: string): string {
  return `${stripTrailingSlashes(appUrl)}/organizations/accept-invite?token=${encodeURIComponent(token)}`;
}
