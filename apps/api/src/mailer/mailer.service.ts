import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import {
  LogMailTransport,
  SmtpMailTransport,
  type MailMessage,
  type MailTransport,
} from './mail.transport';
import {
  buildInviteUrl,
  buildPasswordResetUrl,
  buildVerificationUrl,
  resolveMailConfig,
  type MailConfig,
} from './mailer.config';
import { toMailParts } from './templates/layout';
import {
  buildAccountDeletedEmail,
  buildAlreadyRegisteredEmail,
  buildInviteEmail,
  buildPasswordResetEmail,
  buildVerificationEmail,
} from './templates/emails';

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
    await this.safeSend({ to, ...toMailParts(buildVerificationEmail(url)) });
  }

  async sendPasswordResetEmail(to: string, rawToken: string): Promise<void> {
    const url = buildPasswordResetUrl(this.config.appUrl, rawToken);
    await this.safeSend({ to, ...toMailParts(buildPasswordResetEmail(url)) });
  }

  async sendOrganizationInviteEmail(to: string, rawToken: string, orgName: string): Promise<void> {
    const url = buildInviteUrl(this.config.appUrl, rawToken);
    await this.safeSend({ to, ...toMailParts(buildInviteEmail(url, orgName)) });
  }

  async sendAlreadyRegisteredEmail(to: string): Promise<void> {
    const loginUrl = `${this.config.appUrl}/login`;
    await this.safeSend({ to, ...toMailParts(buildAlreadyRegisteredEmail(loginUrl)) });
  }

  /** Best-effort confirmation that a self-service account deletion completed. */
  async sendAccountDeletedEmail(to: string): Promise<void> {
    await this.safeSend({ to, ...toMailParts(buildAccountDeletedEmail()) });
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
