import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Power,
  PowerOff,
  FolderInput,
  Tag as TagIcon,
  Trash2,
  X,
  ChevronDown,
} from 'lucide-react';
import type { Folder, Tag } from '@tietide/shared';
import { cn } from '@/utils/cn';

export interface BulkActionsToolbarProps {
  count: number;
  busy: boolean;
  folders: Folder[];
  tags: Tag[];
  onActivate: () => void | Promise<void>;
  onDeactivate: () => void | Promise<void>;
  onMove: (folderId: string | null) => void | Promise<void>;
  onAddTags: (tagIds: string[]) => void | Promise<void>;
  onManageTags?: () => void;
  onDelete: () => void;
  onClear: () => void;
}

export function BulkActionsToolbar({
  count,
  busy,
  folders,
  tags,
  onActivate,
  onDeactivate,
  onMove,
  onAddTags,
  onManageTags,
  onDelete,
  onClear,
}: BulkActionsToolbarProps): JSX.Element {
  const [moveOpen, setMoveOpen] = useState(false);
  const moveRef = useRef<HTMLDivElement>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState<string[]>([]);
  const tagsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moveOpen) return;
    const handleClickOutside = (event: globalThis.MouseEvent): void => {
      if (moveRef.current && !moveRef.current.contains(event.target as Node)) {
        setMoveOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [moveOpen]);

  useEffect(() => {
    if (!tagsOpen) return;
    const handleClickOutside = (event: globalThis.MouseEvent): void => {
      if (tagsRef.current && !tagsRef.current.contains(event.target as Node)) {
        setTagsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [tagsOpen]);

  const pickFolder = (folderId: string | null): void => {
    setMoveOpen(false);
    void onMove(folderId);
  };

  const toggleDraftTag = (tagId: string): void => {
    setTagDraft((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  };

  const applyTags = (): void => {
    setTagsOpen(false);
    void onAddTags(tagDraft);
    setTagDraft([]);
  };

  const showMove = folders.length > 0;

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className={cn(
        'mb-4 flex flex-wrap items-center gap-2 rounded-md border border-accent-teal/30 bg-accent-teal/[0.06] px-3 py-2',
      )}
    >
      <span className="text-sm font-semibold text-text-primary">{count} selected</span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void onActivate()}
          disabled={busy}
          aria-label="Activate selected workflows"
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary transition',
            'hover:bg-accent-teal/10 hover:text-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          <Power aria-hidden="true" className="h-3.5 w-3.5" />
          Activate
        </button>
        <button
          type="button"
          onClick={() => void onDeactivate()}
          disabled={busy}
          aria-label="Deactivate selected workflows"
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary transition',
            'hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-accent-teal',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          <PowerOff aria-hidden="true" className="h-3.5 w-3.5" />
          Deactivate
        </button>

        {showMove && (
          <div ref={moveRef} className="relative">
            <button
              type="button"
              onClick={() => setMoveOpen((v) => !v)}
              disabled={busy}
              aria-label="Move to folder"
              aria-haspopup="menu"
              aria-expanded={moveOpen}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary transition',
                'hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-accent-teal',
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              <FolderInput aria-hidden="true" className="h-3.5 w-3.5" />
              Move to folder
              <ChevronDown aria-hidden="true" className="h-3 w-3" />
            </button>
            {moveOpen && (
              <div
                role="menu"
                aria-label="Move to folder"
                className={cn(
                  'absolute right-0 z-10 mt-1 max-h-72 w-56 overflow-auto rounded-md border border-white/10 bg-elevated p-1 shadow-lg',
                )}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => pickFolder(null)}
                  className="block w-full truncate rounded px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-white/5 hover:text-text-primary"
                >
                  No folder (Root)
                </button>
                <div className="my-1 border-t border-white/5" />
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    role="menuitem"
                    onClick={() => pickFolder(folder.id)}
                    className="block w-full truncate rounded px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-white/5 hover:text-text-primary"
                  >
                    {folder.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div ref={tagsRef} className="relative">
          <button
            type="button"
            onClick={() => setTagsOpen((v) => !v)}
            disabled={busy}
            aria-label="Add tags"
            aria-haspopup="menu"
            aria-expanded={tagsOpen}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary transition',
              'hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-accent-teal',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            <TagIcon aria-hidden="true" className="h-3.5 w-3.5" />
            Add tags
            <ChevronDown aria-hidden="true" className="h-3 w-3" />
          </button>
          {tagsOpen && (
            <div
              role="menu"
              aria-label="Add tags"
              className={cn(
                'absolute right-0 z-10 mt-1 max-h-72 w-56 overflow-auto rounded-md border border-white/10 bg-elevated p-1 shadow-lg',
              )}
            >
              {tags.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-text-muted">No tags yet</p>
              ) : (
                tags.map((tag) => {
                  const checked = tagDraft.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={checked}
                      onClick={() => toggleDraftTag(tag.id)}
                      className="flex w-full items-center gap-2 truncate rounded px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-white/5 hover:text-text-primary"
                    >
                      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                        {checked && (
                          <Check aria-hidden="true" className="h-3.5 w-3.5 text-accent-teal" />
                        )}
                      </span>
                      {tag.color && (
                        <span
                          aria-hidden
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                      )}
                      <span className="truncate">{tag.name}</span>
                    </button>
                  );
                })
              )}
              <div className="my-1 border-t border-white/5" />
              <button
                type="button"
                onClick={applyTags}
                disabled={tagDraft.length === 0}
                className={cn(
                  'block w-full rounded px-2 py-1.5 text-left text-xs font-semibold text-accent-teal transition',
                  'hover:bg-accent-teal/10 disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                Apply tags
              </button>
              {onManageTags && (
                <button
                  type="button"
                  onClick={() => {
                    setTagsOpen(false);
                    onManageTags();
                  }}
                  className="block w-full rounded px-2 py-1.5 text-left text-xs text-text-muted hover:bg-white/5 hover:text-text-primary"
                >
                  Manage tags
                </button>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          aria-label="Delete selected workflows"
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-error transition',
            'hover:bg-error/10 focus:outline-none focus:ring-1 focus:ring-error',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
          Delete
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-text-muted transition',
            'hover:bg-white/5 hover:text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent-teal',
          )}
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>
    </div>
  );
}
