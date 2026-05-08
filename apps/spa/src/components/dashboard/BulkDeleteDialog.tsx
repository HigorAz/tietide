import { useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from './Modal';
import { cn } from '@/utils/cn';

export interface BulkDeleteDialogProps {
  count: number;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

export function BulkDeleteDialog({
  count,
  onClose,
  onConfirm,
}: BulkDeleteDialogProps): JSX.Element {
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async (): Promise<void> => {
    setSubmitting(true);
    try {
      await onConfirm();
    } catch {
      setSubmitting(false);
    }
  };

  const noun = count === 1 ? 'workflow' : 'workflows';

  return (
    <Modal titleId="bulk-delete-title" ariaLabel="Delete selected workflows" onClose={onClose}>
      <h2 id="bulk-delete-title" className="mb-2 text-lg font-semibold text-text-primary">
        Delete {count} {noun}
      </h2>
      <p className="mb-4 text-sm text-text-secondary">
        Are you sure you want to delete{' '}
        <span className="font-semibold text-text-primary">
          {count} selected {noun}
        </span>
        ? This will permanently remove them and their execution history.
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
          <span>{submitting ? 'Deleting…' : `Delete ${noun}`}</span>
        </button>
      </div>
    </Modal>
  );
}
