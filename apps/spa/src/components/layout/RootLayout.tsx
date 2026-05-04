import { Outlet } from 'react-router-dom';
import { Toaster } from '@/components/ui/Toaster';

export function RootLayout(): JSX.Element {
  return (
    <>
      <Toaster />
      <Outlet />
    </>
  );
}
