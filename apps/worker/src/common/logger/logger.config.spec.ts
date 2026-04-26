import { buildLoggerOptions } from './logger.config';

interface PinoHttpLike {
  level: string;
  redact: { paths: string[]; censor: string };
  autoLogging: unknown;
}

function pinoHttpFrom(opts: ReturnType<typeof buildLoggerOptions>): PinoHttpLike {
  return opts.pinoHttp as unknown as PinoHttpLike;
}

describe('buildLoggerOptions (worker)', () => {
  describe('level', () => {
    it('should default to "info" when LOG_LEVEL is not set', () => {
      const opts = buildLoggerOptions({});
      expect(pinoHttpFrom(opts).level).toBe('info');
    });

    it('should use LOG_LEVEL when provided', () => {
      const opts = buildLoggerOptions({ LOG_LEVEL: 'warn' });
      expect(pinoHttpFrom(opts).level).toBe('warn');
    });

    it('should fall back to "info" for unknown LOG_LEVEL values', () => {
      const opts = buildLoggerOptions({ LOG_LEVEL: 'verbose-shouty' });
      expect(pinoHttpFrom(opts).level).toBe('info');
    });
  });

  describe('redact', () => {
    it('should censor common sensitive job/payload field names', () => {
      const { redact } = pinoHttpFrom(buildLoggerOptions({}));
      expect(redact.paths).toEqual(
        expect.arrayContaining([
          '*.password',
          '*.token',
          '*.secret',
          '*.apiKey',
          '*.encryptionKey',
          '*.hmacSecret',
          '*.nonce',
          '*.authorization',
        ]),
      );
      expect(redact.censor).toBe('[REDACTED]');
    });
  });

  describe('autoLogging', () => {
    it('should disable HTTP auto-logging — the worker has no HTTP server', () => {
      const { autoLogging } = pinoHttpFrom(buildLoggerOptions({}));
      expect(autoLogging).toBe(false);
    });
  });
});
