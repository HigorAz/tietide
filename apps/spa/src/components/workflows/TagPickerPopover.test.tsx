import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Tag } from '@tietide/shared';
import { TagPickerPopover } from './TagPickerPopover';

const tags: Tag[] = [
  { id: 't1', name: 'urgent', color: '#ef4444', createdAt: new Date('2026-05-01T00:00:00Z') },
  { id: 't2', name: 'finance', color: null, createdAt: new Date('2026-05-01T00:00:00Z') },
];

describe('TagPickerPopover', () => {
  it('opens and reflects the current selection', async () => {
    const user = userEvent.setup();
    render(
      <TagPickerPopover
        tags={tags}
        selectedIds={['t1']}
        onChange={vi.fn()}
        triggerAriaLabel="Edit tags for Alpha"
      />,
    );

    await user.click(screen.getByRole('button', { name: /edit tags for alpha/i }));

    expect(screen.getByRole('menuitemcheckbox', { name: /urgent/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('menuitemcheckbox', { name: /finance/i })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('checking an unselected tag emits the augmented id list', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TagPickerPopover
        tags={tags}
        selectedIds={['t1']}
        onChange={onChange}
        triggerAriaLabel="Edit tags for Alpha"
      />,
    );

    await user.click(screen.getByRole('button', { name: /edit tags for alpha/i }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: /finance/i }));

    expect(onChange).toHaveBeenCalledWith(['t1', 't2']);
  });

  it('unchecking a selected tag removes it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TagPickerPopover
        tags={tags}
        selectedIds={['t1']}
        onChange={onChange}
        triggerAriaLabel="Edit tags for Alpha"
      />,
    );

    await user.click(screen.getByRole('button', { name: /edit tags for alpha/i }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: /urgent/i }));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('invokes onManage when Manage tags is clicked', async () => {
    const user = userEvent.setup();
    const onManage = vi.fn();
    render(
      <TagPickerPopover
        tags={tags}
        selectedIds={[]}
        onChange={vi.fn()}
        onManage={onManage}
        triggerAriaLabel="Edit tags for Alpha"
      />,
    );

    await user.click(screen.getByRole('button', { name: /edit tags for alpha/i }));
    await user.click(screen.getByRole('button', { name: /manage tags/i }));

    expect(onManage).toHaveBeenCalled();
  });

  it('shows an empty-state hint when there are no tags', async () => {
    const user = userEvent.setup();
    render(
      <TagPickerPopover
        tags={[]}
        selectedIds={[]}
        onChange={vi.fn()}
        onManage={vi.fn()}
        triggerAriaLabel="Edit tags for Alpha"
      />,
    );

    await user.click(screen.getByRole('button', { name: /edit tags for alpha/i }));

    expect(screen.getByText(/no tags yet/i)).toBeInTheDocument();
  });
});
