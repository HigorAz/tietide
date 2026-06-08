import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { createOrganization } from '@/api/organizations';
import { cn } from '@/utils/cn';

const fieldClass = cn(
  'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary',
  'focus:outline-none focus:ring-1 focus:ring-accent-teal',
);

export function OrganizationsPage(): JSX.Element {
  const organizations = useAuthStore((s) => s.organizations);
  const active = useAuthStore((s) => s.activeOrganization);
  const switchOrganization = useAuthStore((s) => s.switchOrganization);
  const loadOrganizations = useAuthStore((s) => s.loadOrganizations);
  const toast = useToastStore((s) => s.show);

  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const created = await createOrganization(trimmed);
      await loadOrganizations();
      switchOrganization(created.id);
      setName('');
      toast({ tone: 'success', message: `Workspace “${created.name}” created.` });
    } catch (err) {
      toast({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Could not create workspace',
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold text-text-primary">Workspaces</h1>

      <ul className="mb-8 space-y-1">
        {organizations.map((o) => {
          const isActive = o.id === active?.id;
          return (
            <li
              key={o.id}
              className="flex items-center justify-between rounded-md bg-white/5 px-3 py-2"
            >
              <span className="inline-flex items-center gap-2 text-sm">
                <Check
                  aria-hidden
                  className={cn('h-4 w-4', isActive ? 'text-accent-teal' : 'opacity-0')}
                />
                <span className="text-text-primary">{o.name}</span>
                <span className="text-xs text-text-secondary">{o.role}</span>
              </span>
              {isActive ? (
                <Link
                  to="/organizations/members"
                  className="text-xs font-medium text-accent-teal hover:underline"
                >
                  Manage members
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => switchOrganization(o.id)}
                  className="rounded px-2.5 py-1 text-xs font-medium text-text-secondary transition hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-accent-teal"
                >
                  Switch
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <form onSubmit={handleCreate} className="max-w-sm space-y-2">
        <h2 className="text-sm font-semibold text-text-primary">Create a workspace</h2>
        <label
          htmlFor="new-workspace-name"
          className="block text-xs font-medium text-text-secondary"
        >
          Name
        </label>
        <input
          id="new-workspace-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My team"
          className={fieldClass}
        />
        <button
          type="submit"
          disabled={creating || name.trim().length === 0}
          className={cn(
            'rounded-md bg-accent-teal px-3 py-1.5 text-sm font-semibold text-deep-blue transition',
            'hover:bg-accent-teal/90 focus:outline-none focus:ring-1 focus:ring-accent-teal',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {creating ? 'Creating…' : 'Create workspace'}
        </button>
      </form>
    </div>
  );
}
