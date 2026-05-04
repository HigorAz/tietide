import { useLocation, useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface SidebarItemProps {
  to: string;
  label: string;
  icon: LucideIcon;
  collapsed: boolean;
  tourTarget?: string;
}

const isPathActive = (pathname: string, to: string): boolean => {
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(`${to}/`);
};

export function SidebarItem({
  to,
  label,
  icon: Icon,
  collapsed,
  tourTarget,
}: SidebarItemProps): JSX.Element {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = isPathActive(pathname, to);

  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      data-active={active ? 'true' : 'false'}
      data-tour={tourTarget}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={cn(
        'flex w-full items-center gap-3 border-l-2 px-3 py-2 text-sm font-medium transition',
        'focus:outline-none focus:ring-1 focus:ring-accent-teal',
        active
          ? 'border-accent-teal bg-accent-teal/15 text-text-primary'
          : 'border-transparent text-text-secondary hover:bg-elevated hover:text-text-primary',
        collapsed && 'justify-center gap-0 px-0',
      )}
    >
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}

export default SidebarItem;
