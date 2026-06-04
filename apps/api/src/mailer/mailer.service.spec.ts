import { MailerService } from './mailer.service';

// With no SMTP_* env configured (the default in tests), MailerService uses the
// log transport, so we assert it logs the message — crucially the verify link —
// and never throws.
describe('MailerService (log transport)', () => {
  const originalEnv = process.env;
  let logger: { log: jest.Mock; error: jest.Mock };
  let mailer: MailerService;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.SMTP_HOST;
    process.env.APP_URL = 'https://app.tietide.com';
    logger = { log: jest.fn(), error: jest.fn() };
    mailer = new MailerService(logger as unknown as never);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('logs the verification email containing the /verify-email link', async () => {
    await mailer.sendVerificationEmail('user@example.com', 'tok-123');

    expect(logger.log).toHaveBeenCalledTimes(1);
    const [meta] = logger.log.mock.calls[0];
    expect(meta.to).toBe('user@example.com');
    expect(meta.body).toContain('https://app.tietide.com/verify-email?token=tok-123');
  });

  it('logs the already-registered email', async () => {
    await mailer.sendAlreadyRegisteredEmail('user@example.com');

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log.mock.calls[0][0].to).toBe('user@example.com');
  });

  it('logs the password-reset email containing the /reset-password link', async () => {
    await mailer.sendPasswordResetEmail('user@example.com', 'reset-tok-123');

    expect(logger.log).toHaveBeenCalledTimes(1);
    const [meta] = logger.log.mock.calls[0];
    expect(meta.to).toBe('user@example.com');
    expect(meta.body).toContain('https://app.tietide.com/reset-password?token=reset-tok-123');
  });
});
