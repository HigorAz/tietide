import { useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/dashboard/Modal';
import { cn } from '@/utils/cn';
import type { OrganizationSummary } from '@/api/organizations';

export interface DeleteWorkspaceDialogProps {
  workspace: OrganizationSummary;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

/**
 * Confirm-delete modal for a workspace. Surfaces the server's message verbatim
 * (the API rejects deleting your sole workspace or the last SUPERADMIN of a
 * shared one) instead of guessing the rules client-side.
 */
export function DeleteWorkspaceDialog({
  workspace,
  onClose,
  onConfirm,
}: DeleteWorkspaceDialogProps): JSX.Element {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : 'Could not delete the workspace');
    }
  };

  return (
    <Modal
      titleId="delete-workspace-title"
      ariaLabel="Delete workspace"
      onClose={onClose}
      className="border border-feedback-error/40"
    >
      <h2 id="delete-workspace-title" className="mb-2 text-lg font-semibold text-text-primary">
        Delete workspace
      </h2>
      <p className="mb-4 text-sm text-text-secondary">
        Permanently delete <span className="font-semibold text-text-primary">{workspace.name}</span>{' '}
        and all of its workflows, connections and history? This cannot be undone.
      </p>

      {error && <p className="mb-3 text-sm text-error">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium text-text-secondary transition',
            'hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-accent-teal',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          className={cn(
            'inline-flex items-center gap-2 rounded-md bg-error px-3 py-1.5 text-sm font-semibold text-white transition',
            'hover:bg-error/90 focus:outline-none focus:ring-1 focus:ring-error',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {submitting && <Spinner size="sm" label="Deleting" />}
          <span>{submitting ? 'Deleting…' : 'Delete workspace'}</span>
        </button>
      </div>
    </Modal>
  );
}
