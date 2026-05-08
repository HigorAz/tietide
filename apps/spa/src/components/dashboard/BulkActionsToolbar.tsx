import { useEffect, useRef, useState } from 'react';
import { Power, PowerOff, FolderInput, Trash2, X, ChevronDown } from 'lucide-react';
import type { Folder } from '@tietide/shared';
import { cn } from '@/utils/cn';

export interface BulkActionsToolbarProps {
  count: number;
  busy: boolean;
  folders: Folder[];
  onActivate: () => void | Promise<void>;
  onDeactivate: () => void | Promise<void>;
  onMove: (folderId: string | null) => void | Promise<void>;
  onDelete: () => void;
  onClear: () => void;
}

export function BulkActionsToolbar({
  count,
  busy,
  folders,
  onActivate,
  onDeactivate,
  onMove,
  onDelete,
  onClear,
}: BulkActionsToolbarProps): JSX.Element {
  const [moveOpen, setMoveOpen] = useState(false);
  const moveRef = useRef<HTMLDivElement>(null);

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

  const pickFolder = (folderId: string | null): void => {
    setMoveOpen(false);
    void onMove(folderId);
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
