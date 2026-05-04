import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function AppShell(): JSX.Element {
  return (
    <div className="flex h-screen bg-deep-blue text-text-primary">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

export default AppShell;
