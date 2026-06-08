import { Link } from 'react-router-dom';
import { Plug, KeyRound, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SettingsCard } from './SettingsCard';

interface Shortcut {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

// Links to the workspace-scoped management surfaces that have their own pages.
// Workspaces themselves are managed below on this page; Secrets have no standalone
// page (they live inside the editor), so both are omitted here.
const shortcuts: Shortcut[] = [
  {
    to: '/connections',
    label: 'Connections',
    description: 'OAuth and API-key integrations',
    icon: Plug,
  },
  {
    to: '/settings/env-vars',
    label: 'Environment variables',
    description: 'Reusable values for your workflows',
    icon: KeyRound,
  },
];

export function WorkspaceShortcutsSection(): JSX.Element {
  return (
    <SettingsCard title="Shortcuts" description="Jump to your workspace-scoped settings.">
      <ul className="divide-y divide-white/5 overflow-hidden rounded-md border border-white/5">
        {shortcuts.map(({ to, label, description, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              className="flex items-center gap-3 bg-elevated/40 px-4 py-3 transition-colors hover:bg-elevated focus:outline-none focus:ring-1 focus:ring-accent-teal"
            >
              <Icon className="h-5 w-5 shrink-0 text-accent-teal" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-text-primary">{label}</span>
                <span className="block text-xs text-text-secondary">{description}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}
