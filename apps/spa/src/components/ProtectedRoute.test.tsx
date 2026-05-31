import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { ProtectedRoute } from './ProtectedRoute';

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
