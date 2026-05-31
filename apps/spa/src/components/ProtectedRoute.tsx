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

export interface AdminRouteProps {
  children: ReactNode;
}

/**
 * Client-side role guard for admin-only routes. The backend RolesGuard is the real
 * authority, but without this a non-admin who navigates to /admin/* would render the
 * admin UI and only see failed API calls. Nest this INSIDE a ProtectedRoute so a
 * token is already present and the user has been hydrated.
 */
export function AdminRoute({ children }: AdminRouteProps): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);

  // Wait for the user to be restored before judging the role, so a refresh on an
  // admin page doesn't bounce an admin out before getMe() resolves.
  if (!hydrated) {
    return (
      <div
        role="status"
        aria-label="Loading"
        className="flex min-h-screen items-center justify-center"
      />
    );
  }
  if (user?.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
