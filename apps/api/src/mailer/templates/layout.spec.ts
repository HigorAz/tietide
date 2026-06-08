import {
  BRAND,
  escapeHtml,
  renderEmailHtml,
  renderEmailText,
  toMailParts,
  type EmailContent,
} from './layout';

const sample: EmailContent = {
  subject: 'Verify your TieTide email',
  preheader: 'Confirm your email to activate your account.',
  heading: 'Welcome to TieTide!',
  paragraphs: ['Confirm your email address to activate your account.', 'Second paragraph.'],
  cta: { label: 'Verify email address', url: 'https://app.tietide.com/verify-email?token=tok-123' },
  footerNote: 'This link expires in 24 hours.',
};

describe('email layout', () => {
  describe('escapeHtml', () => {
    it('escapes the five HTML-significant characters', () => {
      expect(escapeHtml(`<script>"a"&'b'`)).toBe('&lt;script&gt;&quot;a&quot;&amp;&#39;b&#39;');
    });

    it('leaves plain text untouched', () => {
      expect(escapeHtml('Acme Workspace')).toBe('Acme Workspace');
    });
  });

  describe('renderEmailHtml', () => {
    const html = renderEmailHtml(sample);

    it('renders a complete HTML document', () => {
      expect(html).toContain('<!doctype html>');
      expect(html).toContain('</html>');
    });

    it('includes the hidden preheader text', () => {
      expect(html).toContain('Confirm your email to activate your account.');
    });

    it('renders the Tie/Tide wordmark with the teal accent on "Tide"', () => {
      expect(html).toContain(`Tie<span style="color:${BRAND.accentTeal};">Tide</span>`);
    });

    it('renders the logo image with alt-text fallback in the header', () => {
      expect(html).toContain(`<img src="${BRAND.logoUrl}"`);
      expect(html).toContain('alt="TieTide"');
    });

    it('renders the heading and every paragraph', () => {
      expect(html).toContain('Welcome to TieTide!');
      expect(html).toContain('Confirm your email address to activate your account.');
      expect(html).toContain('Second paragraph.');
    });

    it('renders the CTA button with the url and label', () => {
      expect(html).toContain('https://app.tietide.com/verify-email?token=tok-123');
      expect(html).toContain('Verify email address');
      expect(html).toContain(BRAND.accentTeal);
    });

    it('centers the CTA button', () => {
      expect(html).toContain('align="center"');
      expect(html).toContain('margin:8px auto 24px;');
    });

    it('renders a copy-paste fallback link when a CTA is present', () => {
      expect(html).toContain('copy and paste');
    });

    it('escapes interpolated content to prevent HTML injection', () => {
      const malicious = renderEmailHtml({
        ...sample,
        heading: '<img src=x onerror=alert(1)>',
        paragraphs: ['<b>bold</b>'],
      });
      expect(malicious).not.toContain('<img src=x');
      expect(malicious).toContain('&lt;img src=x');
      expect(malicious).toContain('&lt;b&gt;bold&lt;/b&gt;');
    });

    it('omits the button when there is no CTA', () => {
      const noCta = renderEmailHtml({ ...sample, cta: undefined });
      expect(noCta).not.toContain('copy and paste');
    });
  });

  describe('renderEmailText', () => {
    const text = renderEmailText(sample);

    it('includes the heading, paragraphs, footer note and raw CTA url', () => {
      expect(text).toContain('Welcome to TieTide!');
      expect(text).toContain('Second paragraph.');
      expect(text).toContain('This link expires in 24 hours.');
      expect(text).toContain('https://app.tietide.com/verify-email?token=tok-123');
    });

    it('contains no HTML tags', () => {
      expect(text).not.toMatch(/<[a-z]/i);
    });
  });

  describe('toMailParts', () => {
    it('returns subject, text and html derived from the content', () => {
      const parts = toMailParts(sample);
      expect(parts.subject).toBe('Verify your TieTide email');
      expect(parts.text).toContain('https://app.tietide.com/verify-email?token=tok-123');
      expect(parts.html).toContain('<!doctype html>');
    });
  });
});
