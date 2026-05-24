import { Menu } from 'lucide-react';

export interface MobileTopBarProps {
  onOpenNav: () => void;
}

/**
 * Sticky top bar shown on mobile/tablet viewports in place of the desktop
 * sidebar. Hosts the hamburger that opens the MobileNavDrawer. Self-hides at
 * the `md` breakpoint via `md:hidden`.
 */
export function MobileTopBar({ onOpenNav }: MobileTopBarProps): JSX.Element {
  return (
    <header
      data-testid="mobile-top-bar"
      className="sticky top-0 z-30 flex items-center gap-2 border-b border-white/5 bg-elevated px-2 py-1.5 md:hidden"
      style={{ paddingTop: 'max(0.375rem, env(safe-area-inset-top))' }}
    >
      <button
        type="button"
        onClick={onOpenNav}
        aria-label="Open navigation"
        className="flex min-h-11 min-w-11 items-center justify-center rounded text-text-secondary transition hover:bg-white/5 hover:text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-teal"
      >
        <Menu aria-hidden className="h-5 w-5" />
      </button>
      <span className="text-sm font-semibold text-text-primary">TieTide</span>
    </header>
  );
}

export default MobileTopBar;
