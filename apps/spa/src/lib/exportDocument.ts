import { createElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { downloadBlob } from './downloadFile';

/**
 * Document export for workflow documentation. Both formats are produced
 * client-side from the markdown body:
 *  - Word: render the markdown to semantic HTML and wrap it as an `.doc`
 *    (zero dependency — Word/Google Docs open HTML-flavoured `.doc` files).
 *  - PDF: lay the markdown out with jsPDF (parsed into headings/paragraphs/
 *    bullets). The genuinely heavy, otherwise-unbundled deps (`react-dom/server`,
 *    `jspdf`) are dynamically imported so they stay out of the main bundle until
 *    the user actually downloads. React/react-markdown are already bundled, so
 *    they are imported statically.
 */

/** Build a filesystem-safe base filename from a workflow name. */
export function slugifyDocFilename(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
  return slug || 'workflow';
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Strip inline markdown markers so a line reads as plain text in a PDF. */
export function stripInlineMarkdown(line: string): string {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → label
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // bold
    .replace(/(\*|_)(.*?)\1/g, '$2') // italic
    .replace(/`([^`]*)`/g, '$1') // inline code
    .trim();
}

export type PdfBlockType = 'h1' | 'h2' | 'h3' | 'p' | 'li';
export interface PdfBlock {
  type: PdfBlockType;
  text: string;
}

/** Parse a markdown string into a flat list of layout blocks for the PDF writer. */
export function markdownToPdfBlocks(markdown: string): PdfBlock[] {
  const blocks: PdfBlock[] = [];
  for (const raw of markdown.split('\n')) {
    const line = raw.replace(/\s+$/u, '');
    if (line.trim() === '') continue;
    if (/^###\s+/.test(line)) {
      blocks.push({ type: 'h3', text: stripInlineMarkdown(line.replace(/^###\s+/, '')) });
    } else if (/^##\s+/.test(line)) {
      blocks.push({ type: 'h2', text: stripInlineMarkdown(line.replace(/^##\s+/, '')) });
    } else if (/^#\s+/.test(line)) {
      blocks.push({ type: 'h1', text: stripInlineMarkdown(line.replace(/^#\s+/, '')) });
    } else if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      blocks.push({
        type: 'li',
        text: stripInlineMarkdown(line.replace(/^\s*([-*+]|\d+\.)\s+/, '')),
      });
    } else if (/^\s*>\s?/.test(line)) {
      blocks.push({ type: 'p', text: stripInlineMarkdown(line.replace(/^\s*>\s?/, '')) });
    } else {
      blocks.push({ type: 'p', text: stripInlineMarkdown(line) });
    }
  }
  return blocks;
}

/** Render the markdown body to a Word-openable `.doc` and trigger the download. */
export async function downloadDocAsWord(
  baseName: string,
  title: string,
  markdown: string,
): Promise<void> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const body = renderToStaticMarkup(
    createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, markdown),
  );
  const html =
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
    '<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1a1a1a;line-height:1.5;}' +
    'h1,h2,h3{font-family:Calibri,Arial,sans-serif;color:#0a2540;}code,pre{font-family:Consolas,monospace;}' +
    'table{border-collapse:collapse;}td,th{border:1px solid #ccc;padding:4px 8px;}</style></head>' +
    `<body>${body}</body></html>`;
  downloadBlob(`${baseName}.doc`, new Blob([html], { type: 'application/msword' }));
}

/** Render the markdown body to a paginated PDF and trigger the download. */
export async function downloadDocAsPdf(
  baseName: string,
  title: string,
  markdown: string,
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const marginX = 48;
  const marginTop = 56;
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - marginX * 2;
  let y = marginTop;

  const writeLine = (text: string, size: number, bold: boolean, indent = 0): void => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, maxWidth - indent) as string[];
    for (const line of lines) {
      if (y + size > pageHeight - marginTop) {
        doc.addPage();
        y = marginTop;
      }
      doc.text(line, marginX + indent, y);
      y += size * 1.4;
    }
  };

  writeLine(title, 18, true);
  y += 6;

  for (const block of markdownToPdfBlocks(markdown)) {
    switch (block.type) {
      case 'h1':
        y += 8;
        writeLine(block.text, 16, true);
        break;
      case 'h2':
        y += 6;
        writeLine(block.text, 14, true);
        break;
      case 'h3':
        y += 4;
        writeLine(block.text, 12, true);
        break;
      case 'li':
        writeLine(`•  ${block.text}`, 11, false, 12);
        break;
      default:
        writeLine(block.text, 11, false);
    }
    y += 2;
  }

  doc.save(`${baseName}.pdf`);
}
