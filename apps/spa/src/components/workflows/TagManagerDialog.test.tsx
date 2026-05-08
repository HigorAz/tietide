import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Tag } from '@tietide/shared';
import { TagManagerDialog } from './TagManagerDialog';

const makeTag = (overrides: Partial<Tag>): Tag => ({
  id: overrides.id ?? 't-1',
  name: overrides.name ?? 'alpha',
  color: overrides.color ?? '#0ea5e9',
  createdAt: new Date('2026-05-08'),
  ...overrides,
});

describe('TagManagerDialog', () => {
  it('lists existing tags', () => {
    render(
      <TagManagerDialog
        tags={[makeTag({ id: 'a', name: 'alpha' }), makeTag({ id: 'b', name: 'beta' })]}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
  });

  it('creates a new tag with the chosen color', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <TagManagerDialog
        tags={[]}
        onClose={vi.fn()}
        onCreate={onCreate}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('New tag name'), 'urgent');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onCreate).toHaveBeenCalledWith('urgent', expect.stringMatching(/^#/));
  });

  it('renames a tag via inline editing', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <TagManagerDialog
        tags={[makeTag({ id: 'a', name: 'old' })]}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'old' }));
    const input = screen.getByLabelText('Rename old');
    await user.clear(input);
    await user.type(input, 'new');
    await user.keyboard('{Enter}');

    expect(onUpdate).toHaveBeenCalledWith('a', { name: 'new' });
  });

  it('deletes a tag', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <TagManagerDialog
        tags={[makeTag({ id: 'a', name: 'alpha' })]}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByLabelText('Delete tag alpha'));
    expect(onDelete).toHaveBeenCalledWith('a');
  });

  it('closes when X is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <TagManagerDialog
        tags={[]}
        onClose={onClose}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    await user.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});
