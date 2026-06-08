import {
  buildAccountDeletedEmail,
  buildAlreadyRegisteredEmail,
  buildInviteEmail,
  buildPasswordResetEmail,
  buildVerificationEmail,
} from './emails';
import { renderEmailHtml } from './layout';

describe('email builders', () => {
  describe('buildVerificationEmail', () => {
    const content = buildVerificationEmail('https://app.tietide.com/verify-email?token=tok-123');

    it('has the verification subject and a CTA pointing at the url', () => {
      expect(content.subject).toBe('Verify your TieTide email');
      expect(content.cta?.url).toBe('https://app.tietide.com/verify-email?token=tok-123');
    });

    it('mentions the 24-hour expiry in the footer note', () => {
      expect(content.footerNote).toContain('24 hours');
    });
  });

  describe('buildPasswordResetEmail', () => {
    const content = buildPasswordResetEmail('https://app.tietide.com/reset-password?token=r-1');

    it('has the reset subject and CTA url', () => {
      expect(content.subject).toBe('Reset your TieTide password');
      expect(content.cta?.url).toBe('https://app.tietide.com/reset-password?token=r-1');
    });

    it('mentions the 1-hour single-use expiry', () => {
      expect(content.footerNote).toContain('1 hour');
    });
  });

  describe('buildInviteEmail', () => {
    it('includes the org name in subject, heading and body and the CTA url', () => {
      const content = buildInviteEmail(
        'https://app.tietide.com/organizations/accept-invite?token=i-1',
        'Acme Workspace',
      );
      expect(content.subject).toContain('Acme Workspace');
      expect(content.heading).toContain('Acme Workspace');
      expect(content.paragraphs.join(' ')).toContain('Acme Workspace');
      expect(content.cta?.url).toBe(
        'https://app.tietide.com/organizations/accept-invite?token=i-1',
      );
    });

    it('escapes a malicious org name once rendered to HTML', () => {
      const content = buildInviteEmail('https://app.tietide.com/x', '<b>Evil</b>');
      const html = renderEmailHtml(content);
      expect(html).not.toContain('<b>Evil</b>');
      expect(html).toContain('&lt;b&gt;Evil&lt;/b&gt;');
    });
  });

  describe('buildAlreadyRegisteredEmail', () => {
    const content = buildAlreadyRegisteredEmail('https://app.tietide.com/login');

    it('has the already-registered subject and a sign-in CTA', () => {
      expect(content.subject).toBe('You already have a TieTide account');
      expect(content.cta?.url).toBe('https://app.tietide.com/login');
    });
  });

  describe('buildAccountDeletedEmail', () => {
    const content = buildAccountDeletedEmail();

    it('confirms deletion and has no CTA', () => {
      expect(content.subject).toBe('Your TieTide account has been deleted');
      expect(content.cta).toBeUndefined();
      expect(content.paragraphs.join(' ').toLowerCase()).toContain('anonymized');
    });
  });
});
