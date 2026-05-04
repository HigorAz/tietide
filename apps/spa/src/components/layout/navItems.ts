import { Home, LayoutDashboard, Workflow, History, Library, Plug } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  tourTarget?: string;
}

export const navItems: NavItem[] = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/workflows', label: 'Workflows', icon: Workflow, tourTarget: 'nav-workflows' },
  { to: '/history', label: 'History', icon: History },
  { to: '/library', label: 'Library', icon: Library, tourTarget: 'nav-library' },
  { to: '/connections', label: 'Connections', icon: Plug },
];
