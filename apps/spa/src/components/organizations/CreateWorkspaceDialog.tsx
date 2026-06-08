import { useState, type FormEvent } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/dashboard/Modal';
import { cn } from '@/utils/cn';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { createOrganization } from '@/api/organizations';

export interface CreateWorkspaceDialogProps {
  onClose: () => void;
}

const fieldClass = cn(
  'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary',
  'focus:outline-none focus:ring-1 focus:ring-accent-teal',
);

/**
 * Create a workspace and switch to it. Lives in the sidebar switcher — the
 * Account Settings management area is deliberately switch/manage only.
 */
export function CreateWorkspaceDialog({ onClose }: CreateWorkspaceDialogProps): JSX.Element {
  const loadOrganizations = useAuthStore((s) => s.loadOrganizations);
  const switchOrganization = useAuthStore((s) => s.switchOrganization);
  const toast = useToastStore((s) => s.show);

  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createOrganization(trimmed);
      await loadOrganizations();
      switchOrganization(created.id);
      toast({ tone: 'success', message: `Workspace “${created.name}” created.` });
      onClose();
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : 'Could not create the workspace');
    }
  };

  return (
    <Modal titleId="create-workspace-title" ariaLabel="Create a workspace" onClose={onClose}>
      <h2 id="create-workspace-title" className="mb-2 text-lg font-semibold text-text-primary">
        Create a workspace
      </h2>
      <p className="mb-4 text-sm text-text-secondary">
        A workspace keeps a team’s workflows, connections and members together.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label
            htmlFor="create-workspace-name"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            Name
          </label>
          <input
            id="create-workspace-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My team"
            autoFocus
            className={fieldClass}
          />
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
            disabled={submitting || name.trim().length === 0}
            className={cn(
              'inline-flex items-center gap-2 rounded-md bg-accent-teal px-3 py-1.5 text-sm font-semibold text-deep-blue transition',
              'hover:bg-accent-teal/90 focus:outline-none focus:ring-1 focus:ring-accent-teal',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            {submitting && <Spinner size="sm" label="Creating" />}
            <span>{submitting ? 'Creating…' : 'Create workspace'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
