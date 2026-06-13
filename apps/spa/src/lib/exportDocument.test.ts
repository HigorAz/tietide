import { describe, it, expect } from 'vitest';
import { markdownToPdfBlocks, slugifyDocFilename, stripInlineMarkdown } from './exportDocument';

describe('slugifyDocFilename', () => {
  it('lowercases, trims, and hyphenates a workflow name', () => {
    expect(slugifyDocFilename('  My Cool Workflow ')).toBe('my-cool-workflow');
  });

  it('strips punctuation and collapses repeated separators', () => {
    expect(slugifyDocFilename('Deploy!! (v2) — final')).toBe('deploy-v2-final');
  });

  it('falls back to "workflow" when nothing remains', () => {
    expect(slugifyDocFilename('***')).toBe('workflow');
  });
});

describe('stripInlineMarkdown', () => {
  it('removes bold, italic, and code markers', () => {
    expect(stripInlineMarkdown('**bold** and _em_ and `code`')).toBe('bold and em and code');
  });

  it('keeps link text but drops the URL', () => {
    expect(stripInlineMarkdown('see [the docs](https://x.test)')).toBe('see the docs');
  });
});

describe('markdownToPdfBlocks', () => {
  it('classifies headings, bullets, and paragraphs and skips blank lines', () => {
    const blocks = markdownToPdfBlocks(
      ['# Title', '', '## Sub', 'A paragraph.', '- item one', '* item two', '### Deep'].join('\n'),
    );

    expect(blocks).toEqual([
      { type: 'h1', text: 'Title' },
      { type: 'h2', text: 'Sub' },
      { type: 'p', text: 'A paragraph.' },
      { type: 'li', text: 'item one' },
      { type: 'li', text: 'item two' },
      { type: 'h3', text: 'Deep' },
    ]);
  });

  it('handles numbered lists and blockquotes, stripping inline markdown', () => {
    const blocks = markdownToPdfBlocks(['1. **first**', '> quoted `code`'].join('\n'));
    expect(blocks).toEqual([
      { type: 'li', text: 'first' },
      { type: 'p', text: 'quoted code' },
    ]);
  });
});
