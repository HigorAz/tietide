import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { PublicUser } from '@tietide/shared';
import { useAuthStore } from '@/stores/authStore';
import { AdminRoute, ProtectedRoute } from './ProtectedRoute';

const resetStore = (): void => {
  useAuthStore.setState({ user: null, token: null, hydrated: false });
  localStorage.clear();
};

const renderAt = (initial: string) =>
  render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/login" element={<div>Login Screen</div>} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <div>Dashboard Screen</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

describe('ProtectedRoute', () => {
  beforeEach(() => {
    resetStore();
  });

  it('should render children when an auth token is present and auth is hydrated', () => {
    useAuthStore.setState({ token: 'jwt-123', hydrated: true });

    renderAt('/dashboard');

    expect(screen.getByText('Dashboard Screen')).toBeInTheDocument();
    expect(screen.queryByText('Login Screen')).not.toBeInTheDocument();
  });

  it('should redirect to /login when no auth token is present', () => {
    renderAt('/dashboard');

    expect(screen.getByText('Login Screen')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard Screen')).not.toBeInTheDocument();
  });

  it('should show a loading state (not redirect, not children) while a token exists but auth is not yet hydrated', () => {
    // This is the refresh case: the token was restored synchronously from
    // localStorage but getMe() has not resolved yet.
    useAuthStore.setState({ token: 'jwt-123', hydrated: false });

    renderAt('/dashboard');

    expect(screen.queryByText('Dashboard Screen')).not.toBeInTheDocument();
    expect(screen.queryByText('Login Screen')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });
});

const adminUser: PublicUser = {
  id: 'u1',
  email: 'a@x.io',
  name: 'Admin',
  role: 'ADMIN',
  emailVerified: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};
const normalUser: PublicUser = {
  id: 'u2',
  email: 'b@x.io',
  name: 'User',
  role: 'USER',
  emailVerified: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const renderAdminAt = (initial: string) =>
  render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/" element={<div>Home Screen</div>} />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <div>Admin Screen</div>
            </AdminRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

describe('AdminRoute', () => {
  beforeEach(() => {
    resetStore();
  });

  it('should render children for an ADMIN user', () => {
    useAuthStore.setState({ token: 'jwt', user: adminUser, hydrated: true });

    renderAdminAt('/admin');

    expect(screen.getByText('Admin Screen')).toBeInTheDocument();
  });

  it('should redirect a non-admin (USER) away from admin routes', () => {
    useAuthStore.setState({ token: 'jwt', user: normalUser, hydrated: true });

    renderAdminAt('/admin');

    expect(screen.queryByText('Admin Screen')).not.toBeInTheDocument();
    expect(screen.getByText('Home Screen')).toBeInTheDocument();
  });

  it('should wait (loading) until auth is hydrated before judging the role', () => {
    useAuthStore.setState({ token: 'jwt', user: null, hydrated: false });

    renderAdminAt('/admin');

    expect(screen.queryByText('Admin Screen')).not.toBeInTheDocument();
    expect(screen.queryByText('Home Screen')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });
});
