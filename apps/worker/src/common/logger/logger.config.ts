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
  '*.accessToken',
  '*.refreshToken',
  '*.access_token',
  '*.refresh_token',
  '*.client_secret',
  // Secret/EnvVar plaintext value, connection decrypted config blob, and their
  // encrypted-at-rest columns — never belong in logs (W3.16).
  '*.value',
  '*.config',
  '*.configEncrypted',
  '*.configNonce',
  '*.valueEnc',
  '*.valueNonce',
  'password',
  'token',
  'secret',
  'authorization',
  'value',
  'config',
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
