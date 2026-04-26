import type { Params } from 'nestjs-pino';

const VALID_LEVELS = new Set(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);
const DEFAULT_LEVEL = 'info';

const REDACT_PATHS = [
  '*.password',
  '*.token',
  '*.secret',
  '*.apiKey',
  '*.encryptionKey',
  '*.hmacSecret',
  '*.nonce',
  '*.authorization',
  'password',
  'token',
  'secret',
  'authorization',
];

export interface BuildLoggerOptionsEnv {
  LOG_LEVEL?: string;
}

function resolveLevel(raw: string | undefined): string {
  if (!raw) return DEFAULT_LEVEL;
  return VALID_LEVELS.has(raw) ? raw : DEFAULT_LEVEL;
}

export function buildLoggerOptions(env: BuildLoggerOptionsEnv = {}): Params {
  return {
    pinoHttp: {
      level: resolveLevel(env.LOG_LEVEL),
      autoLogging: false,
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]', remove: false },
      base: { app: 'worker' },
    },
  };
}
