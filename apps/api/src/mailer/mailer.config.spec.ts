import {
  DEFAULT_APP_URL,
  DEFAULT_MAIL_FROM,
  buildVerificationUrl,
  resolveMailConfig,
} from './mailer.config';

describe('mailer.config', () => {
  describe('resolveMailConfig', () => {
    it('uses the log transport (no smtp) when SMTP_HOST is unset', () => {
      const cfg = resolveMailConfig({});
      expect(cfg.smtp).toBeUndefined();
      expect(cfg.from).toBe(DEFAULT_MAIL_FROM);
      expect(cfg.appUrl).toBe(DEFAULT_APP_URL);
    });

    it('builds an SMTP config when SMTP_HOST is set', () => {
      const cfg = resolveMailConfig({
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '587',
        SMTP_USER: 'user',
        SMTP_PASS: 'pass',
        SMTP_FROM: 'TieTide <hi@example.com>',
      });
      expect(cfg.from).toBe('TieTide <hi@example.com>');
      expect(cfg.smtp).toEqual({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        user: 'user',
        pass: 'pass',
      });
    });

    it('marks port 465 as secure by default', () => {
      const cfg = resolveMailConfig({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: '465' });
      expect(cfg.smtp?.secure).toBe(true);
    });

    it('honors SMTP_SECURE=true on a non-465 port', () => {
      const cfg = resolveMailConfig({
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '2525',
        SMTP_SECURE: 'true',
      });
      expect(cfg.smtp?.secure).toBe(true);
    });

    it('falls back to the first CORS_ORIGIN for appUrl and strips a trailing slash', () => {
      const cfg = resolveMailConfig({ CORS_ORIGIN: 'https://app.tietide.com/,https://other.com' });
      expect(cfg.appUrl).toBe('https://app.tietide.com');
    });

    it('prefers APP_URL over CORS_ORIGIN', () => {
      const cfg = resolveMailConfig({
        APP_URL: 'https://spa.tietide.com',
        CORS_ORIGIN: 'https://x',
      });
      expect(cfg.appUrl).toBe('https://spa.tietide.com');
    });
  });

  describe('buildVerificationUrl', () => {
    it('builds a /verify-email URL with the token query-encoded', () => {
      expect(buildVerificationUrl('https://app.tietide.com', 'abc+/=')).toBe(
        'https://app.tietide.com/verify-email?token=abc%2B%2F%3D',
      );
    });

    it('does not double a trailing slash on the base url', () => {
      expect(buildVerificationUrl('https://app.tietide.com/', 'tok')).toBe(
        'https://app.tietide.com/verify-email?token=tok',
      );
    });
  });
});
