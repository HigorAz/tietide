import type { Logger } from 'nestjs-pino';
import type { SmtpConfig } from './mailer.config';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

/**
 * Default transport when no SMTP server is configured (dev, tests, or any
 * environment without mail). It logs the message — crucially the verification
 * link — so the flow is exercisable end-to-end without a mail server, and never
 * blocks or fails registration.
 */
export class LogMailTransport implements MailTransport {
  constructor(private readonly logger: Logger) {}

  async send(message: MailMessage): Promise<void> {
    this.logger.log(
      { to: message.to, subject: message.subject, body: message.text },
      'Outbound email (log transport — SMTP not configured)',
    );
  }
}

// Minimal structural type for the slice of nodemailer we use, so the optional
// dependency does not need its @types package at compile time.
interface NodemailerTransporter {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<unknown>;
}
interface NodemailerModule {
  createTransport(options: Record<string, unknown>): NodemailerTransporter;
}

/**
 * SMTP transport backed by nodemailer (an optional dependency). nodemailer is
 * imported lazily so the package is only required when SMTP is actually enabled;
 * if it cannot be loaded, sending throws and the caller (MailerService) logs and
 * swallows it — registration still succeeds and reveals nothing.
 */
export class SmtpMailTransport implements MailTransport {
  private transporter?: Promise<NodemailerTransporter>;

  constructor(
    private readonly smtp: SmtpConfig,
    private readonly from: string,
  ) {}

  private async getTransporter(): Promise<NodemailerTransporter> {
    if (!this.transporter) {
      this.transporter = (async () => {
        const imported = (await import('nodemailer')) as unknown as
          | NodemailerModule
          | { default: NodemailerModule };
        const nodemailer =
          'createTransport' in imported
            ? imported
            : (imported as { default: NodemailerModule }).default;
        return nodemailer.createTransport({
          host: this.smtp.host,
          port: this.smtp.port,
          secure: this.smtp.secure,
          auth: this.smtp.user ? { user: this.smtp.user, pass: this.smtp.pass } : undefined,
        });
      })();
    }
    return this.transporter;
  }

  async send(message: MailMessage): Promise<void> {
    const transporter = await this.getTransporter();
    await transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}
