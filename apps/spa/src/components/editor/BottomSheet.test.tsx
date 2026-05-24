import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BottomSheet } from './BottomSheet';

describe('BottomSheet', () => {
  it('renders nothing when closed', () => {
    render(
      <BottomSheet open={false} onClose={vi.fn()} title="Nodes">
        <p>body</p>
      </BottomSheet>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the title and children when open', () => {
    render(
      <BottomSheet open onClose={vi.fn()} title="Nodes">
        <p>body content</p>
      </BottomSheet>,
    );
    expect(screen.getByRole('dialog', { name: /nodes/i })).toBeInTheDocument();
    expect(screen.getByText('body content')).toBeInTheDocument();
  });

  it('calls onClose when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <BottomSheet open onClose={onClose} title="Nodes">
        <p>body</p>
      </BottomSheet>,
    );
    await user.click(screen.getByTestId('bottom-sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <BottomSheet open onClose={onClose} title="Nodes">
        <p>body</p>
      </BottomSheet>,
    );
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <BottomSheet open onClose={onClose} title="Nodes">
        <p>body</p>
      </BottomSheet>,
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
