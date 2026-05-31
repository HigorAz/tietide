import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import {
  LogMailTransport,
  SmtpMailTransport,
  type MailMessage,
  type MailTransport,
} from './mail.transport';
import { buildVerificationUrl, resolveMailConfig, type MailConfig } from './mailer.config';

/**
 * Sends transactional auth emails. The transport is chosen once at construction:
 * SMTP when configured, otherwise a log transport so dev/tests work without a
 * mail server. All sends are best-effort — a delivery failure is logged and
 * swallowed so it can never 500 a request or leak whether an address exists (W2.1).
 */
@Injectable()
export class MailerService {
  private readonly config: MailConfig;
  private readonly transport: MailTransport;

  constructor(private readonly logger: Logger) {
    this.config = resolveMailConfig(process.env);
    this.transport = this.config.smtp
      ? new SmtpMailTransport(this.config.smtp, this.config.from)
      : new LogMailTransport(this.logger);
  }

  async sendVerificationEmail(to: string, rawToken: string): Promise<void> {
    const url = buildVerificationUrl(this.config.appUrl, rawToken);
    await this.safeSend({
      to,
      subject: 'Verify your TieTide email',
      text:
        `Welcome to TieTide!\n\n` +
        `Confirm your email address to activate your account:\n${url}\n\n` +
        `This link expires in 24 hours. If you didn't create an account, you can ignore this email.`,
    });
  }

  async sendAlreadyRegisteredEmail(to: string): Promise<void> {
    await this.safeSend({
      to,
      subject: 'You already have a TieTide account',
      text:
        `Someone tried to create a TieTide account with this email, but one already exists.\n\n` +
        `If this was you, just sign in at ${this.config.appUrl}/login` +
        ` (use "forgot password" if you don't remember it).\n\n` +
        `If it wasn't you, you can safely ignore this email — no account was created or changed.`,
    });
  }

  private async safeSend(message: MailMessage): Promise<void> {
    try {
      await this.transport.send(message);
    } catch (err) {
      this.logger.error(
        { to: message.to, subject: message.subject, err: (err as Error).message },
        'Failed to send email',
      );
    }
  }
}
