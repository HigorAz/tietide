import { useState } from 'react';
import type { Workflow } from '@tietide/shared';
import { Modal } from './Modal';
import { cn } from '@/utils/cn';

export interface DeleteWorkflowDialogProps {
  workflow: Workflow;
  onClose: () => void;
  onConfirm: (id: string) => Promise<void> | void;
}

export function DeleteWorkflowDialog({
  workflow,
  onClose,
  onConfirm,
}: DeleteWorkflowDialogProps): JSX.Element {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async (): Promise<void> => {
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm(workflow.id);
    } catch (err) {
      setSubmitting(false);
      const message =
        err instanceof Error && err.message ? err.message : 'Failed to delete workflow';
      setError(message);
    }
  };

  return (
    <Modal titleId="delete-workflow-title" ariaLabel="Delete workflow" onClose={onClose}>
      <h2 id="delete-workflow-title" className="mb-2 text-lg font-semibold text-text-primary">
        Delete workflow
      </h2>
      <p className="mb-4 text-sm text-text-secondary">
        Are you sure you want to delete{' '}
        <span className="font-semibold text-text-primary">{workflow.name}</span>? This will
        permanently remove the workflow and its execution history.
      </p>

      {error && (
        <p className="mb-3 rounded-md bg-error/10 px-3 py-2 text-sm text-error" role="alert">
          {error}
        </p>
      )}

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
            'rounded-md bg-error px-3 py-1.5 text-sm font-semibold text-white transition',
            'hover:bg-error/90 focus:outline-none focus:ring-1 focus:ring-error',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {submitting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </Modal>
  );
}
