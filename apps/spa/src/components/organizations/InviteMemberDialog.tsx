import { useState, type FormEvent } from 'react';
import type { OrgRole } from '@tietide/shared';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/dashboard/Modal';
import { cn } from '@/utils/cn';

export interface InviteMemberDialogProps {
  // The roles the current manager may grant (already filtered by rank by the caller).
  assignableRoles: OrgRole[];
  onClose: () => void;
  onSubmit: (email: string, role: OrgRole) => Promise<void> | void;
}

const fieldClass = cn(
  'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary',
  'focus:outline-none focus:ring-1 focus:ring-accent-teal',
);

export function InviteMemberDialog({
  assignableRoles,
  onClose,
  onSubmit,
}: InviteMemberDialogProps): JSX.Element {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>(
    assignableRoles[assignableRoles.length - 1] ?? 'MEMBER',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(email.trim(), role);
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : 'Could not send the invitation');
    }
  };

  return (
    <Modal titleId="invite-member-title" ariaLabel="Invite a member" onClose={onClose}>
      <h2 id="invite-member-title" className="mb-2 text-lg font-semibold text-text-primary">
        Invite a member
      </h2>
      <p className="mb-4 text-sm text-text-secondary">
        They’ll receive an email with a link to join this workspace.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label
            htmlFor="invite-email"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@example.com"
            className={fieldClass}
          />
        </div>

        <div>
          <label
            htmlFor="invite-role"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            Role
          </label>
          <select
            id="invite-role"
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
        </div>

        {error && <p className="text-sm text-error">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-1">
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
            type="submit"
            disabled={submitting || email.trim().length === 0}
            className={cn(
              'inline-flex items-center gap-2 rounded-md bg-accent-teal px-3 py-1.5 text-sm font-semibold text-deep-blue transition',
              'hover:bg-accent-teal/90 focus:outline-none focus:ring-1 focus:ring-accent-teal',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            {submitting && <Spinner size="sm" label="Sending" />}
            <span>{submitting ? 'Sending…' : 'Send invite'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
