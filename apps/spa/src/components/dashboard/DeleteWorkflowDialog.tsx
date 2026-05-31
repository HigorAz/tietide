import { useState } from 'react';
import type { WorkflowListItem } from '@/api/workflows';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from './Modal';
import { cn } from '@/utils/cn';

export interface DeleteWorkflowDialogProps {
  workflow: WorkflowListItem;
  onClose: () => void;
  onConfirm: (id: string) => Promise<void> | void;
}

export function DeleteWorkflowDialog({
  workflow,
  onClose,
  onConfirm,
}: DeleteWorkflowDialogProps): JSX.Element {
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async (): Promise<void> => {
    setSubmitting(true);
    try {
      await onConfirm(workflow.id);
    } catch {
      setSubmitting(false);
      // Parent toasts the error.
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
          <span>{submitting ? 'Deleting…' : 'Delete'}</span>
        </button>
      </div>
    </Modal>
  );
}
