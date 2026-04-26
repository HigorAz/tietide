import { buildLoggerOptions, REQUEST_ID_HEADER } from './logger.config';

interface PinoHttpLike {
  level: string;
  redact: { paths: string[]; censor: string };
  autoLogging?: unknown;
  genReqId?: (
    req: { headers?: Record<string, string | string[] | undefined> },
    res: { setHeader: (k: string, v: string) => void },
  ) => string;
  customProps?: (req: unknown) => Record<string, unknown>;
}

function pinoHttpFrom(opts: ReturnType<typeof buildLoggerOptions>): PinoHttpLike {
  return opts.pinoHttp as unknown as PinoHttpLike;
}

describe('buildLoggerOptions (api)', () => {
  describe('level', () => {
    it('should default to "info" when LOG_LEVEL is not set', () => {
      const opts = buildLoggerOptions({});
      expect(pinoHttpFrom(opts).level).toBe('info');
    });

    it('should use LOG_LEVEL when provided', () => {
      const opts = buildLoggerOptions({ LOG_LEVEL: 'debug' });
      expect(pinoHttpFrom(opts).level).toBe('debug');
    });

    it('should fall back to "info" for unknown LOG_LEVEL values', () => {
      const opts = buildLoggerOptions({ LOG_LEVEL: 'not-a-level' });
      expect(pinoHttpFrom(opts).level).toBe('info');
    });
  });

  describe('redact', () => {
    it('should censor sensitive request header paths', () => {
      const { redact } = pinoHttpFrom(buildLoggerOptions({}));
      expect(redact.paths).toEqual(
        expect.arrayContaining([
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-webhook-signature"]',
        ]),
      );
      expect(redact.censor).toBe('[REDACTED]');
    });

    it('should censor common sensitive body field names at any depth', () => {
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
        ]),
      );
    });
  });

  describe('genReqId', () => {
    it('should reuse the inbound x-request-id header for end-to-end correlation', () => {
      const { genReqId } = pinoHttpFrom(buildLoggerOptions({}));
      const setHeader = jest.fn();
      const id = genReqId!({ headers: { [REQUEST_ID_HEADER]: 'req-from-client' } }, { setHeader });
      expect(id).toBe('req-from-client');
      expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'req-from-client');
    });

    it('should generate a UUID when no x-request-id header is present', () => {
      const { genReqId } = pinoHttpFrom(buildLoggerOptions({}));
      const setHeader = jest.fn();
      const id = genReqId!({ headers: {} }, { setHeader });
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, id);
    });

    it('should reject array-valued correlation headers and generate a fresh UUID', () => {
      const { genReqId } = pinoHttpFrom(buildLoggerOptions({}));
      const setHeader = jest.fn();
      const id = genReqId!({ headers: { [REQUEST_ID_HEADER]: ['a', 'b'] } }, { setHeader });
      expect(id).not.toBe('a');
      expect(id).toMatch(/^[0-9a-f]{8}-/);
    });
  });

  describe('customProps', () => {
    it('should attach userId when req.user.id is set', () => {
      const { customProps } = pinoHttpFrom(buildLoggerOptions({}));
      const props = customProps!({ user: { id: 'u-1' } });
      expect(props).toEqual({ userId: 'u-1' });
    });

    it('should return an empty object when req.user is missing', () => {
      const { customProps } = pinoHttpFrom(buildLoggerOptions({}));
      const props = customProps!({});
      expect(props).toEqual({});
    });
  });
});
