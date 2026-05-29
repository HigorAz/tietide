import {
  DEFAULT_CORS_ORIGIN,
  buildHelmetOptions,
  isProduction,
  resolveCorsOrigin,
  shouldEnableSwagger,
} from './security.config';

describe('security.config', () => {
  describe('isProduction', () => {
    it('is true only when NODE_ENV === "production"', () => {
      expect(isProduction({ NODE_ENV: 'production' })).toBe(true);
      expect(isProduction({ NODE_ENV: 'development' })).toBe(false);
      expect(isProduction({})).toBe(false);
    });
  });

  describe('resolveCorsOrigin', () => {
    it('falls back to the Vite dev origin when CORS_ORIGIN is unset in dev', () => {
      expect(resolveCorsOrigin({ NODE_ENV: 'development' })).toBe(DEFAULT_CORS_ORIGIN);
    });

    it('throws in production when CORS_ORIGIN is missing (no permissive default)', () => {
      expect(() => resolveCorsOrigin({ NODE_ENV: 'production' })).toThrow(/CORS_ORIGIN/);
    });

    it('throws in production when CORS_ORIGIN is blank or only commas', () => {
      expect(() => resolveCorsOrigin({ NODE_ENV: 'production', CORS_ORIGIN: '   ' })).toThrow(
        /CORS_ORIGIN/,
      );
      expect(() => resolveCorsOrigin({ NODE_ENV: 'production', CORS_ORIGIN: ' , , ' })).toThrow(
        /CORS_ORIGIN/,
      );
    });

    it('returns a single string for one configured origin', () => {
      expect(
        resolveCorsOrigin({ NODE_ENV: 'production', CORS_ORIGIN: 'https://app.tietide.com' }),
      ).toBe('https://app.tietide.com');
    });

    it('returns a trimmed array for a comma-separated list', () => {
      expect(
        resolveCorsOrigin({
          NODE_ENV: 'production',
          CORS_ORIGIN: 'https://app.tietide.com, https://tietide.com',
        }),
      ).toEqual(['https://app.tietide.com', 'https://tietide.com']);
    });
  });

  describe('buildHelmetOptions', () => {
    it('pins a strong HSTS policy in production', () => {
      const opts = buildHelmetOptions({ NODE_ENV: 'production' });
      expect(opts.hsts).toEqual({ maxAge: 31_536_000, includeSubDomains: true, preload: true });
    });

    it('disables HSTS outside production (plain HTTP dev)', () => {
      expect(buildHelmetOptions({ NODE_ENV: 'development' }).hsts).toBe(false);
    });

    it('enforces a locked-down CSP in production', () => {
      const opts = buildHelmetOptions({ NODE_ENV: 'production' });
      expect(opts.contentSecurityPolicy).toMatchObject({
        directives: {
          'default-src': ["'none'"],
          'frame-ancestors': ["'none'"],
        },
      });
    });

    it('disables CSP outside production so Swagger UI can load', () => {
      expect(buildHelmetOptions({ NODE_ENV: 'development' }).contentSecurityPolicy).toBe(false);
    });
  });

  describe('shouldEnableSwagger', () => {
    it('is enabled by default in dev', () => {
      expect(shouldEnableSwagger({ NODE_ENV: 'development' })).toBe(true);
    });

    it('can be force-disabled in dev', () => {
      expect(shouldEnableSwagger({ NODE_ENV: 'development', SWAGGER_ENABLED: 'false' })).toBe(
        false,
      );
    });

    it('is disabled by default in production', () => {
      expect(shouldEnableSwagger({ NODE_ENV: 'production' })).toBe(false);
    });

    it('can be explicitly opted into in production', () => {
      expect(shouldEnableSwagger({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' })).toBe(true);
    });
  });
});
