import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAuthStore } from '@/stores/authStore';

export interface OrgSwitcherProps {
  collapsed?: boolean;
}

const itemClass = cn(
  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition',
  'hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-accent-teal',
);

export function OrgSwitcher({ collapsed = false }: OrgSwitcherProps): JSX.Element | null {
  const organizations = useAuthStore((s) => s.organizations);
  const active = useAuthStore((s) => s.activeOrganization);
  const switchOrganization = useAuthStore((s) => s.switchOrganization);
  const [open, setOpen] = useState(false);

  // Collapsed rail: a single icon link to the workspaces page (no room for a menu).
  if (collapsed) {
    return (
      <div className="flex justify-center border-b border-white/5 px-2 py-2">
        <Link
          to="/organizations"
          aria-label="Workspaces"
          title={active?.name ?? 'Workspaces'}
          className="rounded p-1 text-text-secondary transition hover:bg-white/5 hover:text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-teal"
        >
          <Building2 aria-hidden className="h-5 w-5" />
        </Link>
      </div>
    );
  }

  return (
    <div data-testid="org-switcher" className="relative border-b border-white/5 px-3 py-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-md bg-white/5 px-2.5 py-1.5 text-sm text-text-primary transition',
          'hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-accent-teal',
        )}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <Building2 aria-hidden className="h-4 w-4 shrink-0 text-text-secondary" />
          <span className="truncate">{active?.name ?? 'No workspace'}</span>
        </span>
        <ChevronsUpDown aria-hidden className="h-4 w-4 shrink-0 text-text-secondary" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-3 right-3 z-20 mt-1 rounded-md border border-white/10 bg-elevated p-1 shadow-lg"
        >
          {organizations.map((o) => (
            <button
              key={o.id}
              type="button"
              role="menuitem"
              onClick={() => {
                switchOrganization(o.id);
                setOpen(false);
              }}
              className={itemClass}
            >
              <Check
                aria-hidden
                className={cn(
                  'h-4 w-4 shrink-0',
                  o.id === active?.id ? 'opacity-100' : 'opacity-0',
                )}
              />
              <span className="truncate text-text-primary">{o.name}</span>
            </button>
          ))}

          <div className="my-1 border-t border-white/5" />

          <Link
            to="/organizations/members"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={cn(itemClass, 'text-text-secondary')}
          >
            Manage members
          </Link>
          <Link
            to="/organizations"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={cn(itemClass, 'text-text-secondary')}
          >
            Workspaces
          </Link>
        </div>
      )}
    </div>
  );
}
