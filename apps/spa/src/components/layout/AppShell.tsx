import { useState } from 'react';
import { Outlet } from 'react-router-dom';
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

  return (
    <div className="flex h-screen flex-col bg-deep-blue text-text-primary md:flex-row">
      {/* Mobile-only top bar; hidden at md+ via its own md:hidden. */}
      <MobileTopBar onOpenNav={() => setNavOpen(true)} />
      {/* Desktop sidebar; hidden below md so it never steals width on phones. */}
      <div className="hidden md:flex md:h-full">
        <Sidebar />
      </div>
      <main className="min-w-0 flex-1 overflow-y-auto">
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
