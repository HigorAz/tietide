import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useAuthStore } from '@/stores/authStore';
import { visibleNavItems } from './navItems';
import { SidebarItem } from './SidebarItem';
import { SidebarFooter } from './SidebarFooter';

export interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Slide-in navigation drawer for mobile/tablet viewports. Reuses the desktop
 * sidebar's nav items and footer so navigation stays DRY. Modeled on the
 * HelpDrawer overlay pattern. Closes on backdrop click, the close button,
 * Escape, and whenever the route changes (so tapping an item dismisses it).
 */
export function MobileNavDrawer({ open, onClose }: MobileNavDrawerProps): JSX.Element | null {
  const userRole = useAuthStore((s) => s.user?.role);
  const items = visibleNavItems(userRole);
  const { pathname } = useLocation();
  const prevPath = useRef(pathname);

  // Dismiss when navigation occurs (item tap → navigate → pathname change).
  useEffect(() => {
    if (!open) {
      prevPath.current = pathname;
      return;
    }
    if (prevPath.current !== pathname) {
      prevPath.current = pathname;
      onClose();
    }
  }, [pathname, open, onClose]);

  // Escape closes.
  useEffect(() => {
    if (!open) return undefined;
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex md:hidden">
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={cn(
          'flex h-full w-72 max-w-[85vw] flex-col border-r border-white/5 bg-elevated',
          'shadow-2xl shadow-black/40',
        )}
      >
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <span className="text-sm font-semibold text-text-primary">TieTide</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="flex min-h-11 min-w-11 items-center justify-center rounded p-1 text-text-secondary transition hover:bg-white/5 hover:text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-teal"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>

        <nav aria-label="Mobile navigation" className="flex-1 overflow-y-auto py-2">
          {items.map((item) => (
            <SidebarItem
              key={item.to}
              to={item.to}
              label={item.label}
              icon={item.icon}
              collapsed={false}
              tourTarget={item.tourTarget}
            />
          ))}
        </nav>

        <SidebarFooter collapsed={false} />
      </aside>

      <div
        data-testid="mobile-nav-backdrop"
        aria-hidden
        onClick={onClose}
        className="flex-1 bg-deep-blue/60"
      />
    </div>
  );
}

export default MobileNavDrawer;
