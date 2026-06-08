// Pure, framework-free rendering of branded transactional emails. One EmailContent
// object yields both the HTML part and a matching plaintext fallback, so the two can
// never drift. Kept free of NestJS (mirrors mailer.config.ts) so it is unit-testable
// in isolation. Layout is table-based with inline styles for broad email-client support.

export interface EmailCta {
  label: string;
  url: string;
}

export interface EmailContent {
  subject: string;
  // Hidden inbox-preview line shown after the subject in most clients.
  preheader: string;
  heading: string;
  paragraphs: string[];
  cta?: EmailCta;
  footerNote?: string;
}

export interface MailParts {
  subject: string;
  text: string;
  html: string;
}

// Brand tokens mirror docs/claude/design-system.md. Emails use a light card with the
// deep-blue header bar and teal accent (transactional mail is light for readability).
export const BRAND = {
  name: 'TieTide',
  accentTeal: '#00D4B3',
  deepBlue: '#0A2540',
  textPrimary: '#0A2540',
  textMuted: '#6B7C93',
  canvas: '#F4F6F8',
  card: '#FFFFFF',
  border: '#E3E8EF',
  fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
  homeUrl: 'https://tietide.com',
} as const;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderEmailHtml(content: EmailContent): string {
  const paragraphs = content.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.textPrimary};">${escapeHtml(p)}</p>`,
    )
    .join('');

  const button = content.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
            <tr><td style="border-radius:8px;background:${BRAND.accentTeal};">
              <a href="${escapeHtml(content.cta.url)}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:${BRAND.deepBlue};text-decoration:none;border-radius:8px;">${escapeHtml(content.cta.label)}</a>
            </td></tr>
          </table>`
    : '';

  const fallbackLink = content.cta
    ? `<p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">Or copy and paste this link into your browser:</p>
          <p style="margin:0 0 24px;font-size:13px;line-height:1.6;word-break:break-all;"><a href="${escapeHtml(content.cta.url)}" style="color:${BRAND.accentTeal};">${escapeHtml(content.cta.url)}</a></p>`
    : '';

  const footerNote = content.footerNote
    ? `<p style="margin:0;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">${escapeHtml(content.footerNote)}</p>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(content.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.canvas};">
<span style="display:none!important;max-height:0;overflow:hidden;opacity:0;color:transparent;visibility:hidden;">${escapeHtml(content.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.canvas};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;font-family:${BRAND.fontFamily};">
      <tr><td style="padding:20px 32px;background:${BRAND.deepBlue};border-radius:12px 12px 0 0;">
        <span style="font-size:22px;font-weight:700;letter-spacing:-0.5px;color:#FFFFFF;">Tie<span style="color:${BRAND.accentTeal};">Tide</span></span>
      </td></tr>
      <tr><td style="padding:32px;background:${BRAND.card};border:1px solid ${BRAND.border};border-top:none;border-radius:0 0 12px 12px;">
        <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${BRAND.textPrimary};">${escapeHtml(content.heading)}</h1>
        ${paragraphs}
        ${button}
        ${fallbackLink}
        ${footerNote}
      </td></tr>
      <tr><td style="padding:24px 32px;text-align:center;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.textMuted};">${BRAND.name} — Integration &amp; Automation Platform<br><a href="${BRAND.homeUrl}" style="color:${BRAND.textMuted};">tietide.com</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export function renderEmailText(content: EmailContent): string {
  const lines: string[] = [content.heading, ''];
  for (const paragraph of content.paragraphs) {
    lines.push(paragraph, '');
  }
  if (content.cta) {
    lines.push(`${content.cta.label}:`, content.cta.url, '');
  }
  if (content.footerNote) {
    lines.push(content.footerNote, '');
  }
  lines.push(`— ${BRAND.name} · tietide.com`);
  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
}

export function toMailParts(content: EmailContent): MailParts {
  return {
    subject: content.subject,
    text: renderEmailText(content),
    html: renderEmailHtml(content),
  };
}
