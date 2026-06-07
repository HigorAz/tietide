import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Folder, Tag } from '@tietide/shared';
import { BulkActionsToolbar } from './BulkActionsToolbar';

const folders: Folder[] = [
  { id: 'folder-a', name: 'Inbox', parentFolderId: null, createdAt: new Date() },
  { id: 'folder-b', name: 'Archive', parentFolderId: null, createdAt: new Date() },
];

const tags: Tag[] = [
  { id: 't-1', name: 'urgent', color: '#ef4444', createdAt: new Date() },
  { id: 't-2', name: 'finance', color: null, createdAt: new Date() },
];

const defaultProps = () => ({
  count: 2,
  busy: false,
  folders,
  tags,
  onActivate: vi.fn().mockResolvedValue(undefined),
  onDeactivate: vi.fn().mockResolvedValue(undefined),
  onMove: vi.fn().mockResolvedValue(undefined),
  onAddTags: vi.fn().mockResolvedValue(undefined),
  onManageTags: vi.fn(),
  onDelete: vi.fn(),
  onClear: vi.fn(),
});

describe('BulkActionsToolbar', () => {
  it('shows the selection count', () => {
    render(<BulkActionsToolbar {...defaultProps()} count={3} />);
    expect(screen.getByText(/3 selected/i)).toBeInTheDocument();
  });

  it('Activate button calls onActivate', async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    render(<BulkActionsToolbar {...props} />);

    await user.click(screen.getByRole('button', { name: /^activate selected/i }));

    expect(props.onActivate).toHaveBeenCalledTimes(1);
  });

  it('Deactivate button calls onDeactivate', async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    render(<BulkActionsToolbar {...props} />);

    await user.click(screen.getByRole('button', { name: /deactivate selected/i }));

    expect(props.onDeactivate).toHaveBeenCalledTimes(1);
  });

  it('Delete button calls onDelete', async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    render(<BulkActionsToolbar {...props} />);

    await user.click(screen.getByRole('button', { name: /delete selected/i }));

    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });

  it('Clear button calls onClear', async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    render(<BulkActionsToolbar {...props} />);

    await user.click(screen.getByRole('button', { name: /clear selection/i }));

    expect(props.onClear).toHaveBeenCalledTimes(1);
  });

  it('Move dropdown lists provided folders + Root and calls onMove with the chosen id', async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    render(<BulkActionsToolbar {...props} />);

    await user.click(screen.getByRole('button', { name: /move to folder/i }));
    expect(screen.getByRole('menuitem', { name: /no folder \(root\)/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Inbox' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));
    expect(props.onMove).toHaveBeenCalledWith('folder-b');
  });

  it('Move dropdown Root entry calls onMove with null', async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    render(<BulkActionsToolbar {...props} />);

    await user.click(screen.getByRole('button', { name: /move to folder/i }));
    await user.click(screen.getByRole('menuitem', { name: /no folder \(root\)/i }));

    expect(props.onMove).toHaveBeenCalledWith(null);
  });

  it('Add tags dropdown applies the drafted tag selection via onAddTags', async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    render(<BulkActionsToolbar {...props} />);

    await user.click(screen.getByRole('button', { name: /^add tags$/i }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: /urgent/i }));
    await user.click(screen.getByRole('button', { name: /apply tags/i }));

    expect(props.onAddTags).toHaveBeenCalledWith(['t-1']);
  });

  it('disables action buttons when busy=true', () => {
    render(<BulkActionsToolbar {...defaultProps()} busy />);
    expect(screen.getByRole('button', { name: /^activate selected/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /deactivate selected/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /delete selected/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /move to folder/i })).toBeDisabled();
  });

  it('hides Move to folder when no folders are provided', () => {
    render(<BulkActionsToolbar {...defaultProps()} folders={[]} />);
    expect(screen.queryByRole('button', { name: /move to folder/i })).not.toBeInTheDocument();
  });
});
