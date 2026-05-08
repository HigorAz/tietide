import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Tag } from '@tietide/shared';
import { TagFilter } from './TagFilter';

const makeTag = (overrides: Partial<Tag>): Tag => ({
  id: overrides.id ?? 't-1',
  name: overrides.name ?? 'tag',
  color: overrides.color ?? null,
  createdAt: new Date('2026-05-08'),
  ...overrides,
});

describe('TagFilter', () => {
  it('renders chips for each tag', () => {
    render(
      <TagFilter
        tags={[makeTag({ id: 'a', name: 'alpha' }), makeTag({ id: 'b', name: 'beta' })]}
        selectedIds={[]}
        onToggle={vi.fn()}
        onClear={vi.fn()}
        onManage={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'alpha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'beta' })).toBeInTheDocument();
  });

  it('calls onToggle with the tag id when a chip is clicked', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <TagFilter
        tags={[makeTag({ id: 'a', name: 'alpha' })]}
        selectedIds={[]}
        onToggle={onToggle}
        onClear={vi.fn()}
        onManage={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'alpha' }));
    expect(onToggle).toHaveBeenCalledWith('a');
  });

  it('marks selected chips as aria-pressed', () => {
    render(
      <TagFilter
        tags={[makeTag({ id: 'a', name: 'alpha' })]}
        selectedIds={['a']}
        onToggle={vi.fn()}
        onClear={vi.fn()}
        onManage={vi.fn()}
      />,
    );
    const chip = screen.getByRole('button', { name: 'alpha' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows "clear" and calls onClear when at least one tag is selected', async () => {
    const onClear = vi.fn();
    const user = userEvent.setup();
    render(
      <TagFilter
        tags={[makeTag({ id: 'a', name: 'alpha' })]}
        selectedIds={['a']}
        onToggle={vi.fn()}
        onClear={onClear}
        onManage={vi.fn()}
      />,
    );
    await user.click(screen.getByLabelText('Clear tag filter'));
    expect(onClear).toHaveBeenCalled();
  });

  it('shows empty hint when no tags exist', () => {
    render(
      <TagFilter
        tags={[]}
        selectedIds={[]}
        onToggle={vi.fn()}
        onClear={vi.fn()}
        onManage={vi.fn()}
      />,
    );
    expect(screen.getByText(/no tags yet/i)).toBeInTheDocument();
  });

  it('opens tag manager via Manage tags button', async () => {
    const onManage = vi.fn();
    const user = userEvent.setup();
    render(
      <TagFilter
        tags={[]}
        selectedIds={[]}
        onToggle={vi.fn()}
        onClear={vi.fn()}
        onManage={onManage}
      />,
    );
    await user.click(screen.getByRole('button', { name: /manage tags/i }));
    expect(onManage).toHaveBeenCalled();
  });
});
