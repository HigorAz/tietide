// Per-email content builders. Each returns an EmailContent describing the message;
// the layout renderer turns it into the HTML + plaintext parts. Wording mirrors the
// previous plain-text emails so behaviour (and security posture) is unchanged — only
// the presentation improves. User-controlled values (orgName) are escaped at render time.

import type { EmailContent } from './layout';

export function buildVerificationEmail(url: string): EmailContent {
  return {
    subject: 'Verify your TieTide email',
    preheader: 'Confirm your email to activate your TieTide account.',
    heading: 'Welcome to TieTide!',
    paragraphs: [
      'Confirm your email address to activate your account and start building integrations.',
    ],
    cta: { label: 'Verify email address', url },
    footerNote:
      "This link expires in 24 hours. If you didn't create a TieTide account, you can safely ignore this email.",
  };
}

export function buildPasswordResetEmail(url: string): EmailContent {
  return {
    subject: 'Reset your TieTide password',
    preheader: 'Reset your TieTide password — this link expires in 1 hour.',
    heading: 'Reset your password',
    paragraphs: ['We received a request to reset the password on your TieTide account.'],
    cta: { label: 'Choose a new password', url },
    footerNote:
      "This link expires in 1 hour and can be used once. If you didn't request this, you can safely ignore this email — your password won't change.",
  };
}

export function buildInviteEmail(url: string, orgName: string): EmailContent {
  return {
    subject: `You've been invited to ${orgName} on TieTide`,
    preheader: `Join the ${orgName} workspace on TieTide.`,
    heading: `You've been invited to ${orgName}`,
    paragraphs: [
      `You've been invited to join the "${orgName}" workspace on TieTide, where your team builds and runs automations together.`,
    ],
    cta: { label: 'Accept invitation', url },
    footerNote:
      "This invite expires in 7 days and can be used once. If you weren't expecting this, you can safely ignore this email.",
  };
}

export function buildAlreadyRegisteredEmail(loginUrl: string): EmailContent {
  return {
    subject: 'You already have a TieTide account',
    preheader: 'Someone tried to register with this email — no action needed.',
    heading: 'You already have an account',
    paragraphs: [
      'Someone tried to create a TieTide account with this email address, but one already exists.',
      'If this was you, just sign in. Use the "forgot password" option if you don\'t remember your password.',
    ],
    cta: { label: 'Sign in to TieTide', url: loginUrl },
    footerNote:
      "If this wasn't you, you can safely ignore this email — no account was created or changed.",
  };
}

export function buildAccountDeletedEmail(): EmailContent {
  return {
    subject: 'Your TieTide account has been deleted',
    preheader: 'Your TieTide account has been deleted and anonymized.',
    heading: 'Your account has been deleted',
    paragraphs: [
      'This confirms that your TieTide account has been closed and your personal information has been anonymized.',
      'Any workspaces where you were the only member have been removed along with their workflows. Shared workspaces keep running without you.',
    ],
    footerNote:
      "If you didn't request this, contact us right away — your account security may be at risk.",
  };
}
