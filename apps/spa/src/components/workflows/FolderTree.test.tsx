import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DndContext } from '@dnd-kit/core';
import type { Folder } from '@tietide/shared';
import { FolderTree } from './FolderTree';

const makeFolder = (overrides: Partial<Folder>): Folder => ({
  id: overrides.id ?? 'f-1',
  name: overrides.name ?? 'Folder',
  parentFolderId: overrides.parentFolderId ?? null,
  createdAt: new Date('2026-05-08'),
  ...overrides,
});

const wrap = (ui: React.ReactNode): JSX.Element => <DndContext>{ui}</DndContext>;

describe('FolderTree', () => {
  it('renders the All / Unfiled pins and the user folders', () => {
    render(
      wrap(
        <FolderTree
          folders={[makeFolder({ id: 'a', name: 'Personal' })]}
          selectedFolderId={undefined}
          onSelect={vi.fn()}
          onCreateFolder={vi.fn()}
          onRequestDelete={vi.fn()}
        />,
      ),
    );

    expect(screen.getByRole('button', { name: /all workflows/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unfiled/i })).toBeInTheDocument();
    expect(screen.getByText('Personal')).toBeInTheDocument();
  });

  it('renders nested folders when parent is expanded', async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <FolderTree
          folders={[
            makeFolder({ id: 'parent', name: 'Parent' }),
            makeFolder({ id: 'child', name: 'Child', parentFolderId: 'parent' }),
          ]}
          selectedFolderId={undefined}
          onSelect={vi.fn()}
          onCreateFolder={vi.fn()}
          onRequestDelete={vi.fn()}
        />,
      ),
    );

    expect(screen.queryByText('Child')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Expand folder'));

    expect(screen.getByText('Child')).toBeInTheDocument();
  });

  it('calls onSelect with undefined when "All workflows" is clicked', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      wrap(
        <FolderTree
          folders={[]}
          selectedFolderId={null}
          onSelect={onSelect}
          onCreateFolder={vi.fn()}
          onRequestDelete={vi.fn()}
        />,
      ),
    );

    await user.click(screen.getByRole('button', { name: /all workflows/i }));
    expect(onSelect).toHaveBeenCalledWith(undefined);
  });

  it('calls onSelect with null for "Unfiled" pin', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      wrap(
        <FolderTree
          folders={[]}
          selectedFolderId={undefined}
          onSelect={onSelect}
          onCreateFolder={vi.fn()}
          onRequestDelete={vi.fn()}
        />,
      ),
    );

    await user.click(screen.getByRole('button', { name: /unfiled/i }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('creates a new root folder via the inline form', async () => {
    const onCreateFolder = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      wrap(
        <FolderTree
          folders={[]}
          selectedFolderId={undefined}
          onSelect={vi.fn()}
          onCreateFolder={onCreateFolder}
          onRequestDelete={vi.fn()}
        />,
      ),
    );

    await user.click(screen.getByRole('button', { name: /new folder/i }));
    await user.type(screen.getByLabelText('New folder name'), 'Personal');
    await user.click(screen.getByRole('button', { name: /add/i }));

    expect(onCreateFolder).toHaveBeenCalledWith('Personal', null);
  });

  it('calls onRequestDelete with the folder when delete is clicked', async () => {
    const onRequestDelete = vi.fn();
    const user = userEvent.setup();
    const folder = makeFolder({ id: 'a', name: 'ToDelete' });
    render(
      wrap(
        <FolderTree
          folders={[folder]}
          selectedFolderId={undefined}
          onSelect={vi.fn()}
          onCreateFolder={vi.fn()}
          onRequestDelete={onRequestDelete}
        />,
      ),
    );

    await user.click(screen.getByLabelText('Delete folder ToDelete'));
    expect(onRequestDelete).toHaveBeenCalledWith(folder);
  });
});
