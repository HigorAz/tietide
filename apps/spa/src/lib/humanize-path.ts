// Turn a data-pill dot-path into a human-friendly label for the picker.
//   author.username → "Author › Username"
//   channelId       → "Channel ID"
//   items.0.id      → "Items › [0] › ID"
//   ""              → "Whole output"

// Lowercased tokens that should render fully uppercased rather than title-cased.
const ACRONYMS: Record<string, string> = {
  id: 'ID',
  url: 'URL',
  uri: 'URI',
  api: 'API',
  ip: 'IP',
  http: 'HTTP',
  https: 'HTTPS',
  html: 'HTML',
  json: 'JSON',
  xml: 'XML',
  csv: 'CSV',
  sql: 'SQL',
  sms: 'SMS',
  uuid: 'UUID',
  cc: 'CC',
  bcc: 'BCC',
};

function humanizeSegment(seg: string): string {
  if (/^\d+$/.test(seg)) return `[${seg}]`;
  const words = seg
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // camelCase boundary
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // ACRONYMWord boundary
    .replace(/[_-]+/g, ' ') // snake_case / kebab-case
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 0);
  return words
    .map((w) => {
      const lower = w.toLowerCase();
      return ACRONYMS[lower] ?? w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

/** Humanize a dot-path. Empty path = the node's whole output. */
export function humanizePath(path: string): string {
  if (path.length === 0) return 'Whole output';
  return path.split('.').map(humanizeSegment).join(' › ');
}
