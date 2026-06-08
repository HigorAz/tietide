import { useState } from 'react';
import type { OrgRole } from '@tietide/shared';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/dashboard/Modal';
import { cn } from '@/utils/cn';
import type { OrgMember } from '@/api/organizations';

export interface ChangeRoleDialogProps {
  member: OrgMember;
  assignableRoles: OrgRole[];
  onClose: () => void;
  onSubmit: (role: OrgRole) => Promise<void> | void;
}

const fieldClass = cn(
  'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary',
  'focus:outline-none focus:ring-1 focus:ring-accent-teal',
);

export function ChangeRoleDialog({
  member,
  assignableRoles,
  onClose,
  onSubmit,
}: ChangeRoleDialogProps): JSX.Element {
  const [role, setRole] = useState<OrgRole>(member.role);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(role);
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : 'Could not change the role');
    }
  };

  return (
    <Modal titleId="change-role-title" ariaLabel="Change member role" onClose={onClose}>
      <h2 id="change-role-title" className="mb-2 text-lg font-semibold text-text-primary">
        Change role
      </h2>
      <p className="mb-4 text-sm text-text-secondary">
        Set the role for <span className="font-semibold text-text-primary">{member.name}</span> (
        {member.email}).
      </p>

      <label
        htmlFor="change-role-select"
        className="mb-1 block text-xs font-medium text-text-secondary"
      >
        Role
      </label>
      <select
        id="change-role-select"
        value={role}
        onChange={(e) => setRole(e.target.value as OrgRole)}
        className={fieldClass}
      >
        {assignableRoles.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>

      {error && <p className="mt-2 text-sm text-error">{error}</p>}

      <div className="mt-4 flex items-center justify-end gap-2">
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
          disabled={submitting || role === member.role}
          className={cn(
            'inline-flex items-center gap-2 rounded-md bg-accent-teal px-3 py-1.5 text-sm font-semibold text-deep-blue transition',
            'hover:bg-accent-teal/90 focus:outline-none focus:ring-1 focus:ring-accent-teal',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {submitting && <Spinner size="sm" label="Saving" />}
          <span>{submitting ? 'Saving…' : 'Save'}</span>
        </button>
      </div>
    </Modal>
  );
}
