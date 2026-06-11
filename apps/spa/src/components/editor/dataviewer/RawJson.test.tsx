import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RawJson } from './RawJson';

describe('RawJson', () => {
  it('tints a string value with the data-string token', () => {
    render(<RawJson value={{ name: 'hello' }} />);
    expect(screen.getByText('"hello"')).toHaveClass('text-data-string');
  });

  it('tints a number value with the data-number token', () => {
    render(<RawJson value={{ count: 42 }} />);
    expect(screen.getByText('42')).toHaveClass('text-data-number');
  });

  it('tints an object key with the data-key token', () => {
    render(<RawJson value={{ name: 'hello' }} />);
    expect(screen.getByText('"name"')).toHaveClass('text-data-key');
  });

  it('tints boolean and null with their tokens', () => {
    render(<RawJson value={{ ok: true, gone: null }} />);
    expect(screen.getByText('true')).toHaveClass('text-data-boolean');
    expect(screen.getByText('null')).toHaveClass('text-data-null');
  });

  it('renders a scrolling, wrapping container with the given testId', () => {
    render(<RawJson value={{ a: 1 }} testId="raw-pane" />);
    const pre = screen.getByTestId('raw-pane');
    expect(pre.className).toContain('overflow-y-auto');
    expect(pre.className).toContain('whitespace-pre-wrap');
  });

  it('degrades undefined to a plain string without throwing', () => {
    render(<RawJson value={undefined} testId="raw-undef" />);
    expect(screen.getByTestId('raw-undef')).toHaveTextContent('null');
  });

  it('degrades a circular value to a plain string without throwing', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => render(<RawJson value={circular} testId="raw-circular" />)).not.toThrow();
    expect(screen.getByTestId('raw-circular')).toBeInTheDocument();
  });

  it('caps an oversized payload and shows a truncation notice', () => {
    // A long string blob serializes well past the 50k-char render cap.
    render(<RawJson value={{ blob: 'x'.repeat(60_000) }} testId="raw-big" />);
    expect(screen.getByTestId('raw-json-truncated')).toHaveTextContent(/output truncated/i);
  });

  it('does not show a truncation notice for small payloads', () => {
    render(<RawJson value={{ a: 1 }} testId="raw-small" />);
    expect(screen.queryByTestId('raw-json-truncated')).toBeNull();
  });
});
