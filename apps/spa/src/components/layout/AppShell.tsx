import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { HelpDrawer } from './HelpDrawer';
import { AppTour } from '@/components/onboarding/AppTour';
import { CheatSheet } from '@/components/help/CheatSheet';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';

export function AppShell(): JSX.Element {
  useGlobalShortcuts();
  return (
    <div className="flex h-screen bg-deep-blue text-text-primary">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <AppTour />
      <HelpDrawer />
      <CheatSheet />
    </div>
  );
}

export default AppShell;
