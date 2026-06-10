import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '@/stores/toastStore';
import { JsonTree } from './JsonTree';

const demo = {
  messages: [
    { id: 'a', threadId: 't1' },
    { id: 'b', threadId: 't2' },
  ],
  resultSizeEstimate: 10,
};

describe('JsonTree', () => {
  let show: ReturnType<typeof vi.fn>;
  let writeText: ReturnType<typeof vi.fn>;
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    show = vi.fn();
    useToastStore.setState({ show });
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
  });

  afterEach(() => {
    Object.assign(navigator, { clipboard: originalClipboard });
    vi.restoreAllMocks();
  });

  it('renders branch rows with count badges and a numeric leaf', () => {
    render(<JsonTree value={{ messages: [{ id: 'a' }], resultSizeEstimate: 10 }} />);
    expect(screen.getByText('messages')).toBeInTheDocument();
    expect(screen.getByText('[1 item]')).toBeInTheDocument();
    expect(screen.getByText('resultSizeEstimate')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('applies type-color classes to keys and scalar values', () => {
    render(<JsonTree value={{ name: 'hi', count: 3, ok: true, gone: null }} />);
    expect(screen.getByText('"hi"')).toHaveClass('text-data-string');
    expect(screen.getByText('3')).toHaveClass('text-data-number');
    expect(screen.getByText('true')).toHaveClass('text-data-boolean');
    expect(screen.getByText('null')).toHaveClass('text-data-null');
    expect(screen.getByText('name')).toHaveClass('text-data-key');
  });

  it('collapses deeper branches and toggles them on click', async () => {
    const user = userEvent.setup();
    render(<JsonTree value={demo} />);
    // First level expanded → messages visible; its children collapsed by default.
    expect(screen.queryByText('threadId')).not.toBeInTheDocument();
    await user.click(screen.getByText('messages'));
    // messages[0] branch now visible (still collapsed one level deeper)
    expect(screen.getByText('[2 fields]')).toBeInTheDocument();
  });

  it('copies a resolveTemplate-compatible pill from the path button', async () => {
    const user = userEvent.setup();
    render(<JsonTree value={demo} pillRef="steps.gmail_search" />);
    // Drill into messages → [0] → id
    await user.click(screen.getByText('messages'));
    await user.click(screen.getByText('0'));
    const idRow = screen.getByText('id').closest('[data-testid="json-row"]');
    expect(idRow).not.toBeNull();
    await user.click(within(idRow as HTMLElement).getByLabelText('Copy path'));
    expect(writeText).toHaveBeenCalledWith('{{steps.gmail_search.messages[0].id}}');
  });

  it('copies the raw unquoted string from the value button', async () => {
    const user = userEvent.setup();
    render(<JsonTree value={{ name: 'hello' }} pillRef="steps.x" />);
    const row = screen.getByText('"hello"').closest('[data-testid="json-row"]');
    await user.click(within(row as HTMLElement).getByLabelText('Copy value'));
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('omits the Copy path button when no pillRef is given', () => {
    render(<JsonTree value={{ name: 'hello' }} />);
    expect(screen.queryByLabelText('Copy path')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Copy value')).toBeInTheDocument();
  });

  it('flattens to matching path:value rows while searching and restores after clearing', () => {
    const { rerender } = render(<JsonTree value={demo} pillRef="steps.x" searchQuery="id" />);
    expect(screen.getByText('messages[0].id')).toBeInTheDocument();
    // Non-matching leaves are hidden in flatten mode.
    expect(screen.queryByText('resultSizeEstimate')).not.toBeInTheDocument();

    rerender(<JsonTree value={demo} pillRef="steps.x" searchQuery="" />);
    // Tree restored → branch key visible again.
    expect(screen.getByText('messages')).toBeInTheDocument();
  });
});
