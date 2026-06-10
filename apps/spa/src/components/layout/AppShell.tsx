import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MobileTopBar } from './MobileTopBar';
import { MobileNavDrawer } from './MobileNavDrawer';
import { HelpDrawer } from './HelpDrawer';
import { AppTour } from '@/components/onboarding/AppTour';
import { CheatSheet } from '@/components/help/CheatSheet';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';

export function AppShell(): JSX.Element {
  useGlobalShortcuts();
  const [navOpen, setNavOpen] = useState(false);

  // <main> is the only scroll container (the shell is locked to the viewport),
  // and it persists across route changes — React Router only swaps the Outlet.
  // Without this, scrolling down one page and navigating away leaves the next
  // page stuck at the old scroll offset. Reset to top on every path change.
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    mainRef.current?.scrollTo?.({ top: 0 });
  }, [pathname]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-deep-blue text-text-primary md:flex-row">
      {/* Mobile-only top bar; hidden at md+ via its own md:hidden. */}
      <MobileTopBar onOpenNav={() => setNavOpen(true)} />
      {/* Desktop sidebar; hidden below md so it never steals width on phones.
          Locked to the viewport height and non-shrinking so it stays fixed in
          place while only <main> scrolls — without this the sidebar scrolled
          away on long pages (e.g. Connections). */}
      <div className="hidden md:flex md:h-screen md:shrink-0">
        <Sidebar />
      </div>
      <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <MobileNavDrawer open={navOpen} onClose={() => setNavOpen(false)} />
      <AppTour />
      <HelpDrawer />
      <CheatSheet />
    </div>
  );
}

export default AppShell;
