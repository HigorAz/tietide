import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

export interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps): JSX.Element {
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);

  // No token at all — nothing to restore, go straight to login.
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  // A token is present but the user hasn't been restored yet: wait for hydrate()
  // rather than flashing protected content (with a null user) or a wrong redirect.
  if (!hydrated) {
    return (
      <div
        role="status"
        aria-label="Loading"
        className="flex min-h-screen items-center justify-center"
      />
    );
  }
  return <>{children}</>;
}
