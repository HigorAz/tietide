import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';
import { navItems } from './navItems';
import { SidebarItem } from './SidebarItem';
import { SidebarFooter } from './SidebarFooter';

export const SIDEBAR_STORAGE_KEY = 'tietide-sidebar-collapsed';

const readCollapsed = (): boolean => {
  try {
    const raw = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (raw === null) return false;
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'boolean' ? parsed : false;
  } catch {
    return false;
  }
};

const writeCollapsed = (value: boolean): void => {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage unavailable / quota exhausted — degrade silently.
  }
};

export function Sidebar(): JSX.Element {
  const [collapsed, setCollapsed] = useState<boolean>(() => readCollapsed());

  useEffect(() => {
    writeCollapsed(collapsed);
  }, [collapsed]);

  const handleToggle = (): void => {
    setCollapsed((current) => !current);
  };

  return (
    <aside
      data-testid="sidebar"
      data-tour="sidebar"
      data-collapsed={collapsed ? 'true' : 'false'}
      className={cn(
        'flex h-full flex-col border-r border-white/5 bg-elevated transition-[width] duration-150',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div
        className={cn(
          'flex items-center border-b border-white/5 px-3 py-3',
          collapsed ? 'justify-center' : 'justify-between',
        )}
      >
        {!collapsed && <span className="text-sm font-semibold text-text-primary">TieTide</span>}
        <button
          type="button"
          onClick={handleToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="rounded p-1 text-text-secondary transition hover:bg-white/5 hover:text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-teal"
        >
          {collapsed ? (
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          ) : (
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          )}
        </button>
      </div>

      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto py-2">
        {navItems.map((item) => (
          <SidebarItem
            key={item.to}
            to={item.to}
            label={item.label}
            icon={item.icon}
            collapsed={collapsed}
            tourTarget={item.tourTarget}
          />
        ))}
      </nav>

      <SidebarFooter collapsed={collapsed} />
    </aside>
  );
}

export default Sidebar;
