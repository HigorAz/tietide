import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Folder } from '@tietide/shared';
import { FolderDeleteDialog } from './FolderDeleteDialog';

const folder: Folder = {
  id: 'f-1',
  name: 'Personal',
  parentFolderId: null,
  createdAt: new Date('2026-05-08'),
};

describe('FolderDeleteDialog', () => {
  it('renders empty-folder copy when counts are zero', () => {
    render(
      <FolderDeleteDialog
        folder={folder}
        counts={{ childFolders: 0, workflows: 0 }}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/this folder is empty/i)).toBeInTheDocument();
  });

  it('renders cascade impact when there is content', () => {
    render(
      <FolderDeleteDialog
        folder={folder}
        counts={{ childFolders: 2, workflows: 5 }}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(screen.getByText(/2/)).toBeInTheDocument();
    expect(screen.getByText(/5/)).toBeInTheDocument();
    expect(screen.getByText(/sub-folder/i)).toBeInTheDocument();
    expect(screen.getByText(/workflow/i)).toBeInTheDocument();
  });

  it('singularises sub-folder/workflow nouns when count is 1', () => {
    render(
      <FolderDeleteDialog
        folder={folder}
        counts={{ childFolders: 1, workflows: 1 }}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // Should not contain 'folders' or 'workflows' (plural) when count is 1
    expect(screen.queryByText(/sub-folders/i)).not.toBeInTheDocument();
  });

  it('invokes onConfirm when Delete is clicked', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <FolderDeleteDialog
        folder={folder}
        counts={{ childFolders: 0, workflows: 0 }}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('invokes onClose when Cancel or X is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <FolderDeleteDialog
        folder={folder}
        counts={{ childFolders: 0, workflows: 0 }}
        onConfirm={vi.fn()}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
