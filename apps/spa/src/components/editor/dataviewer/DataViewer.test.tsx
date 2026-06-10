import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastStore } from '@/stores/toastStore';
import { DataViewer } from './DataViewer';

const demo = {
  messages: [
    { id: 'a', threadId: 't1' },
    { id: 'b', threadId: 't2' },
  ],
  resultSizeEstimate: 10,
};

describe('DataViewer', () => {
  beforeEach(() => {
    useToastStore.setState({ show: vi.fn() });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to the tree pane', () => {
    render(<DataViewer value={demo} />);
    expect(screen.getByTestId('data-viewer')).toBeInTheDocument();
    // tree shows branch key + count badge
    expect(screen.getByText('messages')).toBeInTheDocument();
    expect(screen.getByText('resultSizeEstimate')).toBeInTheDocument();
  });

  it('switches to the Raw pane when Raw is clicked', async () => {
    const user = userEvent.setup();
    render(<DataViewer value={demo} testId="dv" />);
    await user.click(screen.getByRole('button', { name: 'Raw' }));
    // raw is a single pretty-printed blob → the key appears quoted
    expect(screen.getByText('"messages"')).toBeInTheDocument();
  });

  it('switches to a Table on the Gmail demo shape when Table is clicked', async () => {
    const user = userEvent.setup();
    render(<DataViewer value={demo} />);
    await user.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.getByRole('columnheader', { name: 'id' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'threadId' })).toBeInTheDocument();
  });

  it('flattens to matching path:value rows while searching and restores on clear', async () => {
    const user = userEvent.setup();
    render(<DataViewer value={demo} pillRef="steps.x" />);
    const input = screen.getByLabelText('Search data');
    await user.type(input, 'id');
    expect(screen.getByText('messages[0].id')).toBeInTheDocument();
    // non-matching leaf hidden in flatten mode
    expect(screen.queryByText('resultSizeEstimate')).not.toBeInTheDocument();

    await user.clear(input);
    // nested tree restored
    expect(screen.getByText('messages')).toBeInTheDocument();
    expect(screen.getByText('resultSizeEstimate')).toBeInTheDocument();
  });

  it('switches back to the tree view when searching from a non-tree pane', async () => {
    const user = userEvent.setup();
    render(<DataViewer value={demo} pillRef="steps.x" />);
    await user.click(screen.getByRole('button', { name: 'Raw' }));
    await user.type(screen.getByLabelText('Search data'), 'id');
    // flattened tree row appears → we're back in tree view
    expect(screen.getByText('messages[0].id')).toBeInTheDocument();
  });

  it('passes pillRef through to the tree (copy path yields a pill)', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    render(<DataViewer value={demo} pillRef="steps.gmail" />);
    // reveal messages[0].id by expanding the array item
    await user.click(screen.getByText('0'));
    const idRow = screen.getByText('id').closest('[data-testid="json-row"]');
    expect(idRow).not.toBeNull();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    await user.click(within(idRow as HTMLElement).getByLabelText('Copy path'));
    expect(writeText).toHaveBeenCalledWith('{{steps.gmail.messages[0].id}}');
  });

  it('renders a null value without throwing', () => {
    render(<DataViewer value={null} testId="dv-null" />);
    expect(screen.getByTestId('dv-null')).toBeInTheDocument();
  });
});
