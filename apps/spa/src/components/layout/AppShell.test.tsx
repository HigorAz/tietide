import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
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

  it('should render a mobile top bar with a hamburger alongside the desktop sidebar', () => {
    renderAt('/dashboard', '/dashboard', <div>Dashboard content</div>);
    expect(screen.getByTestId('mobile-top-bar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open navigation/i })).toBeInTheDocument();
  });

  it('should open the mobile nav drawer when the hamburger is clicked', async () => {
    const user = userEvent.setup();
    renderAt('/dashboard', '/dashboard', <div>Dashboard content</div>);
    expect(screen.queryByRole('dialog', { name: /navigation/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: /open navigation/i }));
    expect(screen.getByRole('dialog', { name: /navigation/i })).toBeInTheDocument();
  });

  it('should reset the main scroll container to the top on navigation', async () => {
    const user = userEvent.setup();
    // jsdom does not implement scrollTo; spy on the prototype so the effect's
    // call is observable.
    const scrollTo = vi.fn();
    const proto = window.HTMLElement.prototype as unknown as {
      scrollTo: typeof scrollTo;
    };
    const original = proto.scrollTo;
    proto.scrollTo = scrollTo;
    try {
      render(
        <MemoryRouter initialEntries={['/first']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/first" element={<Link to="/second">Go to second</Link>} />
              <Route path="/second" element={<div>Second page</div>} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );

      scrollTo.mockClear();
      await user.click(screen.getByRole('link', { name: /go to second/i }));

      expect(screen.getByText('Second page')).toBeInTheDocument();
      expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    } finally {
      proto.scrollTo = original;
    }
  });
});
