import { useState, type FormEvent } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/utils/cn';
import {
  renameOrganization,
  deleteOrganization,
  type OrganizationSummary,
} from '@/api/organizations';
import { DeleteWorkspaceDialog } from '@/components/organizations/DeleteWorkspaceDialog';

export interface WorkspaceAdminSectionProps {
  /** The active workspace. Caller gates this to SUPERADMIN; keyed by id so the
   * rename field resets when the user switches workspaces. */
  activeOrg: OrganizationSummary;
}

const primaryBtn = cn(
  'inline-flex items-center gap-2 rounded-md bg-accent-teal px-3 py-2 text-sm font-semibold text-deep-blue',
  'transition-colors hover:bg-accent-teal-hover disabled:cursor-not-allowed disabled:opacity-60',
);

const dangerBtn = cn(
  'inline-flex items-center gap-2 rounded-md bg-feedback-error px-3 py-2 text-sm font-semibold text-white',
  'transition-colors hover:bg-feedback-error/90',
);

/**
 * Rename / delete the active workspace. SUPERADMIN-only (enforced by the caller).
 * Deleting reconciles the active workspace via loadOrganizations(), which drops
 * the now-missing org and falls back to the next membership.
 */
export function WorkspaceAdminSection({ activeOrg }: WorkspaceAdminSectionProps): JSX.Element {
  const loadOrganizations = useAuthStore((s) => s.loadOrganizations);
  const toast = useToastStore((s) => s.show);

  const [name, setName] = useState(activeOrg.name);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const trimmed = name.trim();
  const renameDisabled = saving || trimmed.length === 0 || trimmed === activeOrg.name;

  const handleRename = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (renameDisabled) return;
    setSaving(true);
    try {
      await renameOrganization(activeOrg.id, trimmed);
      await loadOrganizations();
      toast({ tone: 'success', message: 'Workspace renamed.' });
    } catch (err) {
      toast({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Could not rename the workspace',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <form onSubmit={handleRename} className="max-w-md">
        <label
          htmlFor="workspace-name"
          className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-secondary"
        >
          Workspace name
        </label>
        <input
          id="workspace-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-white/10 bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-teal focus:outline-none focus:ring-1 focus:ring-accent-teal"
        />
        <button type="submit" disabled={renameDisabled} className={cn(primaryBtn, 'mt-3')}>
          {saving && <Spinner size="sm" label="Saving" />}
          <span>{saving ? 'Saving…' : 'Save name'}</span>
        </button>
      </form>

      <div className="mt-6 border-t border-feedback-error/20 pt-4">
        <p className="mb-2 text-sm text-text-secondary">
          Deleting a workspace removes its workflows, connections and history for everyone.
        </p>
        <button type="button" onClick={() => setDeleteOpen(true)} className={dangerBtn}>
          Delete workspace
        </button>
      </div>

      {deleteOpen && (
        <DeleteWorkspaceDialog
          workspace={activeOrg}
          onClose={() => setDeleteOpen(false)}
          onConfirm={async () => {
            await deleteOrganization(activeOrg.id);
            // Refetch memberships; the persisted active id no longer matches, so
            // loadOrganizations falls back to the first remaining workspace (or none).
            await loadOrganizations();
            setDeleteOpen(false);
            toast({ tone: 'success', message: `Workspace “${activeOrg.name}” was deleted.` });
          }}
        />
      )}
    </div>
  );
}
