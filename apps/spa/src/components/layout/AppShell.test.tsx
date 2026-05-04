import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { useAuthStore } from '@/stores/authStore';

const renderAt = (initial: string, path: string, child: React.ReactNode) =>
  render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path={path} element={child} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

describe('AppShell', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: null, token: 'jwt-test', logout: vi.fn() });
  });

  it('should render the sidebar alongside the matched outlet content', () => {
    renderAt('/dashboard', '/dashboard', <div>Dashboard content</div>);
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByText('Dashboard content')).toBeInTheDocument();
  });

  it('should expose a navigation landmark and a main landmark together', () => {
    renderAt('/library', '/library', <div>Library content</div>);
    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByText('Library content')).toBeInTheDocument();
  });

  it('should render the sidebar alongside a wildcard child route for unknown paths', () => {
    render(
      <MemoryRouter initialEntries={['/some-unknown-path']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="*" element={<div>Catch-all content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByText('Catch-all content')).toBeInTheDocument();
  });
});
