import { useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/dashboard/Modal';
import { cn } from '@/utils/cn';
import type { OrgMember } from '@/api/organizations';

export interface RemoveMemberDialogProps {
  member: OrgMember;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

export function RemoveMemberDialog({
  member,
  onClose,
  onConfirm,
}: RemoveMemberDialogProps): JSX.Element {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : 'Could not remove the member');
    }
  };

  return (
    <Modal titleId="remove-member-title" ariaLabel="Remove member" onClose={onClose}>
      <h2 id="remove-member-title" className="mb-2 text-lg font-semibold text-text-primary">
        Remove member
      </h2>
      <p className="mb-4 text-sm text-text-secondary">
        Remove <span className="font-semibold text-text-primary">{member.name}</span> (
        {member.email}) from this workspace? They’ll lose access to its workflows and resources.
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
          {submitting && <Spinner size="sm" label="Removing" />}
          <span>{submitting ? 'Removing…' : 'Remove'}</span>
        </button>
      </div>
    </Modal>
  );
}
