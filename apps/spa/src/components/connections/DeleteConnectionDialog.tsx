import { useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/dashboard/Modal';
import { cn } from '@/utils/cn';
import type { ConnectionView } from '@/api/connections';

export interface DeleteConnectionDialogProps {
  connection: ConnectionView;
  onClose: () => void;
  onConfirm: (id: string) => Promise<void> | void;
}

export function DeleteConnectionDialog({
  connection,
  onClose,
  onConfirm,
}: DeleteConnectionDialogProps): JSX.Element {
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async (): Promise<void> => {
    setSubmitting(true);
    try {
      await onConfirm(connection.id);
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <Modal titleId="revoke-connection-title" ariaLabel="Revoke connection" onClose={onClose}>
      <h2 id="revoke-connection-title" className="mb-2 text-lg font-semibold text-text-primary">
        Revoke connection
      </h2>
      <p className="mb-4 text-sm text-text-secondary">
        Are you sure you want to revoke{' '}
        <span className="font-semibold text-text-primary">{connection.name}</span>? Workflows that
        depend on this connection will stop working.
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
          {submitting && <Spinner size="sm" label="Revoking" />}
          <span>{submitting ? 'Revoking…' : 'Revoke'}</span>
        </button>
      </div>
    </Modal>
  );
}
