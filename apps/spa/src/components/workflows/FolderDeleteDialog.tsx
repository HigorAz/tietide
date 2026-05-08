import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { Folder } from '@tietide/shared';
import { cn } from '@/utils/cn';

interface ChildCounts {
  childFolders: number;
  workflows: number;
}

interface FolderDeleteDialogProps {
  folder: Folder;
  counts: ChildCounts;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

export function FolderDeleteDialog({
  folder,
  counts,
  onConfirm,
  onClose,
}: FolderDeleteDialogProps): JSX.Element {
  const [submitting, setSubmitting] = useState(false);
  const isEmpty = counts.childFolders === 0 && counts.workflows === 0;

  const handleConfirm = async (): Promise<void> => {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="folder-delete-title"
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
    >
      <div className="w-full max-w-md rounded-lg border border-white/10 bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" aria-hidden />
            <h2 id="folder-delete-title" className="text-base font-semibold text-text-primary">
              Delete folder “{folder.name}”?
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-text-muted hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isEmpty ? (
          <p className="mb-5 text-sm text-text-secondary">
            This folder is empty. It will be deleted.
          </p>
        ) : (
          <div className="mb-5 space-y-2 text-sm text-text-secondary">
            <p className="font-semibold text-error">This cannot be undone.</p>
            <p>
              The following items will be{' '}
              <span className="font-semibold text-error">permanently deleted</span>:
            </p>
            <ul className="ml-4 list-disc text-text-secondary">
              {counts.childFolders > 0 && (
                <li>
                  <span className="font-semibold">{counts.childFolders}</span> sub-folder
                  {counts.childFolders === 1 ? '' : 's'}
                </li>
              )}
              {counts.workflows > 0 && (
                <li>
                  <span className="font-semibold">{counts.workflows}</span> workflow
                  {counts.workflows === 1 ? '' : 's'} (with their executions, versions, and
                  webhooks)
                </li>
              )}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-white/10 bg-elevated px-3 py-1.5 text-sm text-text-secondary transition hover:bg-white/5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={submitting}
            className={cn(
              'rounded-md bg-error px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-error/80 disabled:opacity-50',
            )}
          >
            {submitting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
