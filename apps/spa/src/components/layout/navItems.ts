import {
  Home,
  LayoutDashboard,
  Workflow,
  History,
  Library,
  Plug,
  KeyRound,
  ShieldCheck,
  ScrollText,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  tourTarget?: string;
  /** When set, the item is only visible if the authenticated user has this role. */
  requiredRole?: 'ADMIN';
}

export const navItems: NavItem[] = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/workflows', label: 'Workflows', icon: Workflow, tourTarget: 'nav-workflows' },
  { to: '/history', label: 'History', icon: History },
  { to: '/library', label: 'Library', icon: Library, tourTarget: 'nav-library' },
  { to: '/connections', label: 'Connections', icon: Plug },
  { to: '/settings/env-vars', label: 'Env vars', icon: KeyRound },
  { to: '/admin/env-vars', label: 'Admin · Env vars', icon: ShieldCheck, requiredRole: 'ADMIN' },
  { to: '/admin/audit', label: 'Admin · Audit log', icon: ScrollText, requiredRole: 'ADMIN' },
];

export function visibleNavItems(role: string | undefined): NavItem[] {
  return navItems.filter((item) => !item.requiredRole || item.requiredRole === role);
}
