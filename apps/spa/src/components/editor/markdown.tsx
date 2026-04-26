import { Fragment, type JSX } from 'react';

type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'paragraph'; text: string };

const HEADING_RE = /^(#{1,3})\s+(.*)$/;
const LIST_RE = /^[-*]\s+(.*)$/;

function parse(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = Math.min(3, heading[1].length) as 1 | 2 | 3;
      blocks.push({ type: 'heading', level, text: heading[2].trim() });
      i += 1;
      continue;
    }

    if (LIST_RE.exec(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = LIST_RE.exec(lines[i]);
        if (!m) break;
        items.push(m[1].trim());
        i += 1;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !HEADING_RE.exec(lines[i]) &&
      !LIST_RE.exec(lines[i])
    ) {
      paragraphLines.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraphLines.join(' ').trim() });
  }

  return blocks;
}

const INLINE_BOLD = /\*\*([^*]+)\*\*/g;
const INLINE_CODE = /`([^`]+)`/g;

function renderInline(text: string): JSX.Element {
  const parts: Array<JSX.Element | string> = [];
  let cursor = 0;
  const tokens: Array<{ start: number; end: number; render: () => JSX.Element }> = [];

  for (const match of text.matchAll(INLINE_BOLD)) {
    const start = match.index ?? 0;
    tokens.push({
      start,
      end: start + match[0].length,
      render: () => <strong>{match[1]}</strong>,
    });
  }
  for (const match of text.matchAll(INLINE_CODE)) {
    const start = match.index ?? 0;
    tokens.push({
      start,
      end: start + match[0].length,
      render: () => <code className="rounded bg-elevated px-1 py-0.5 text-xs">{match[1]}</code>,
    });
  }
  tokens.sort((a, b) => a.start - b.start);

  let key = 0;
  for (const tok of tokens) {
    if (tok.start < cursor) continue;
    if (tok.start > cursor) parts.push(text.slice(cursor, tok.start));
    parts.push(<Fragment key={key++}>{tok.render()}</Fragment>);
    cursor = tok.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));

  return <>{parts}</>;
}

interface MarkdownProps {
  source: string;
}

export function Markdown({ source }: MarkdownProps) {
  const blocks = parse(source);

  return (
    <div className="space-y-3 text-sm leading-relaxed text-text-primary">
      {blocks.map((block, idx) => {
        if (block.type === 'heading') {
          const sizes = {
            1: 'text-xl font-semibold',
            2: 'text-lg font-semibold',
            3: 'text-base font-semibold',
          };
          if (block.level === 1) {
            return (
              <h1 key={idx} className={sizes[1]}>
                {renderInline(block.text)}
              </h1>
            );
          }
          if (block.level === 2) {
            return (
              <h2 key={idx} className={sizes[2]}>
                {renderInline(block.text)}
              </h2>
            );
          }
          return (
            <h3 key={idx} className={sizes[3]}>
              {renderInline(block.text)}
            </h3>
          );
        }
        if (block.type === 'list') {
          return (
            <ul key={idx} className="list-disc space-y-1 pl-5 text-text-secondary">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={idx} className="text-text-secondary">
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}
