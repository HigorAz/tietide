import { randomUUID } from 'node:crypto';
import type { Params } from 'nestjs-pino';

export const REQUEST_ID_HEADER = 'x-request-id';

const VALID_LEVELS = new Set(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);
const DEFAULT_LEVEL = 'info';

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-webhook-signature"]',
  'req.body.password',
  'req.body.token',
  'req.body.secret',
  'res.headers["set-cookie"]',
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

interface MinimalReq {
  headers?: Record<string, string | string[] | undefined>;
  user?: { id?: string };
}

interface MinimalRes {
  setHeader: (key: string, value: string) => void;
}

function resolveLevel(raw: string | undefined): string {
  if (!raw) return DEFAULT_LEVEL;
  return VALID_LEVELS.has(raw) ? raw : DEFAULT_LEVEL;
}

export function buildLoggerOptions(env: BuildLoggerOptionsEnv = {}): Params {
  const level = resolveLevel(env.LOG_LEVEL);

  return {
    pinoHttp: {
      level,
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]', remove: false },
      genReqId: (req: unknown, res: unknown): string => {
        const r = req as MinimalReq;
        const w = res as MinimalRes;
        const incoming = r.headers?.[REQUEST_ID_HEADER];
        const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
        w.setHeader(REQUEST_ID_HEADER, id);
        return id;
      },
      customProps: (req: unknown): Record<string, unknown> => {
        const r = req as MinimalReq;
        return r.user?.id ? { userId: r.user.id } : {};
      },
      serializers: {
        req: (req: { id?: string; method?: string; url?: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
      },
    },
  };
}
