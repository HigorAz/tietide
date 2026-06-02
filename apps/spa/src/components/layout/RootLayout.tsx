import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Toaster } from '@/components/ui/Toaster';
import { useAuthStore } from '@/stores/authStore';

export function RootLayout(): JSX.Element {
  const hydrate = useAuthStore((s) => s.hydrate);

  // Restore the signed-in user from the persisted token once on app mount, so a
  // page refresh keeps the session instead of dropping the user object (W4.1).
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <>
      <Toaster />
      <Outlet />
    </>
  );
}
