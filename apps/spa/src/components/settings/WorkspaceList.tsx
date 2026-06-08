import { Check } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/utils/cn';
import { roleLabel } from '@/components/organizations/roleLabels';

/**
 * Read-only list of the workspaces the user belongs to, with a Switch action for
 * the inactive ones. Creation lives in the sidebar workspace switcher, not here.
 */
export function WorkspaceList(): JSX.Element {
  const organizations = useAuthStore((s) => s.organizations);
  const active = useAuthStore((s) => s.activeOrganization);
  const switchOrganization = useAuthStore((s) => s.switchOrganization);

  if (organizations.length === 0) {
    return <p className="text-sm text-text-secondary">You don’t belong to any workspaces yet.</p>;
  }

  return (
    <ul className="space-y-1">
      {organizations.map((o) => {
        const isActive = o.id === active?.id;
        return (
          <li
            key={o.id}
            className="flex items-center justify-between gap-3 rounded-md bg-white/5 px-3 py-2"
          >
            <span className="inline-flex min-w-0 items-center gap-2 text-sm">
              <Check
                aria-hidden
                className={cn('h-4 w-4 shrink-0', isActive ? 'text-accent-teal' : 'opacity-0')}
              />
              <span className="truncate text-text-primary">{o.name}</span>
              <span className="shrink-0 text-xs text-text-secondary">{roleLabel(o.role)}</span>
            </span>
            {isActive ? (
              <span className="shrink-0 rounded-full bg-accent-teal/15 px-2 py-0.5 text-xs font-medium text-accent-teal">
                Active
              </span>
            ) : (
              <button
                type="button"
                onClick={() => switchOrganization(o.id)}
                className="shrink-0 rounded px-2.5 py-1 text-xs font-medium text-text-secondary transition hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-accent-teal"
              >
                Switch
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
