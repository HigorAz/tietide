import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar, SIDEBAR_STORAGE_KEY } from './Sidebar';
import { navItems, visibleNavItems } from './navItems';
import { useAuthStore } from '@/stores/authStore';

type StoreUser = { id: string; email: string; name: string; role: string } | null;
const setUser = (user: StoreUser): void => {
  useAuthStore.setState({ user: user as never, token: 'jwt-test' });
};
const adminUser: StoreUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  name: 'Admin',
  role: 'ADMIN',
};
const regularUser: StoreUser = { id: 'u-1', email: 'u@example.com', name: 'U', role: 'USER' };

const renderAt = (initial = '/dashboard') =>
  render(
    <MemoryRouter initialEntries={[initial]}>
      <Sidebar />
    </MemoryRouter>,
  );

describe('Sidebar', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: null, token: 'jwt-test', logout: vi.fn() });
  });

  describe('collapse persistence', () => {
    it('should default to expanded when localStorage is empty', () => {
      renderAt();
      expect(screen.getByTestId('sidebar')).toHaveAttribute('data-collapsed', 'false');
    });

    it('should rehydrate collapsed=true from localStorage on mount', () => {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, 'true');
      renderAt();
      expect(screen.getByTestId('sidebar')).toHaveAttribute('data-collapsed', 'true');
    });

    it('should fall back to expanded when stored value is invalid JSON', () => {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, '{not-json');
      renderAt();
      expect(screen.getByTestId('sidebar')).toHaveAttribute('data-collapsed', 'false');
    });

    it('should fall back to expanded when stored value is not a boolean', () => {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, '"yes"');
      renderAt();
      expect(screen.getByTestId('sidebar')).toHaveAttribute('data-collapsed', 'false');
    });

    it('should persist new state to localStorage when toggled', async () => {
      const user = userEvent.setup();
      renderAt();
      await user.click(screen.getByRole('button', { name: /collapse sidebar/i }));
      expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('true');
      expect(screen.getByTestId('sidebar')).toHaveAttribute('data-collapsed', 'true');
    });

    it('should not throw when localStorage.setItem fails', async () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded');
      });
      const user = userEvent.setup();
      renderAt();
      await expect(
        user.click(screen.getByRole('button', { name: /collapse sidebar/i })),
      ).resolves.not.toThrow();
      expect(screen.getByTestId('sidebar')).toHaveAttribute('data-collapsed', 'true');
      setItemSpy.mockRestore();
    });
  });

  describe('rendering', () => {
    it('should render the user-visible nav items in the configured order (no admin entry for unknown role)', () => {
      renderAt();
      const nav = screen.getByRole('navigation', { name: /main navigation/i });
      const buttons = within(nav).getAllByRole('button');
      const expected = visibleNavItems(undefined);
      expect(buttons).toHaveLength(expected.length);
      expected.forEach((item, idx) => {
        expect(buttons[idx]).toHaveAccessibleName(new RegExp(item.label, 'i'));
      });
    });

    it('should render the SidebarFooter buttons (Help, Account settings, Sign out)', () => {
      renderAt();
      expect(screen.getByRole('button', { name: /help/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /account settings/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
    });
  });

  describe('role-based nav filtering', () => {
    it('should NOT render the admin env-vars entry when the user is a regular USER', () => {
      setUser(regularUser);
      renderAt();
      const nav = screen.getByRole('navigation', { name: /main navigation/i });
      expect(within(nav).queryByRole('button', { name: /admin · env vars/i })).toBeNull();
    });

    it('should NOT render the admin env-vars entry when no user is signed in', () => {
      setUser(null);
      renderAt();
      const nav = screen.getByRole('navigation', { name: /main navigation/i });
      expect(within(nav).queryByRole('button', { name: /admin · env vars/i })).toBeNull();
    });

    it('should render the admin env-vars entry when the user is an ADMIN', () => {
      setUser(adminUser);
      renderAt();
      const nav = screen.getByRole('navigation', { name: /main navigation/i });
      expect(within(nav).getByRole('button', { name: /admin · env vars/i })).toBeInTheDocument();
    });

    it('should render the user env-vars (Settings) entry for both USER and ADMIN', () => {
      setUser(regularUser);
      const { unmount } = renderAt();
      const nav1 = screen.getByRole('navigation', { name: /main navigation/i });
      expect(within(nav1).getByRole('button', { name: /^env vars$/i })).toBeInTheDocument();
      unmount();
      setUser(adminUser);
      renderAt();
      const nav2 = screen.getByRole('navigation', { name: /main navigation/i });
      expect(within(nav2).getByRole('button', { name: /^env vars$/i })).toBeInTheDocument();
    });
  });
});

describe('visibleNavItems', () => {
  it('should hide ADMIN-only items when role is undefined', () => {
    const visible = visibleNavItems(undefined);
    expect(visible.find((i) => i.requiredRole === 'ADMIN')).toBeUndefined();
  });

  it('should hide ADMIN-only items when role is USER', () => {
    const visible = visibleNavItems('USER');
    expect(visible.find((i) => i.requiredRole === 'ADMIN')).toBeUndefined();
  });

  it('should include ADMIN-only items when role is ADMIN', () => {
    const visible = visibleNavItems('ADMIN');
    const adminItems = visible.filter((i) => i.requiredRole === 'ADMIN');
    expect(adminItems.length).toBeGreaterThan(0);
  });

  it('should preserve the order of items between filters', () => {
    const visibleAdmin = visibleNavItems('ADMIN');
    const visibleUser = visibleNavItems('USER');
    // navItems is the source of truth for order; visible lists should be subsequences
    const adminOrder = visibleAdmin.map((i) => i.to);
    const userOrder = visibleUser.map((i) => i.to);
    const fullOrder = navItems.map((i) => i.to);
    expect(adminOrder).toEqual(fullOrder.filter((to) => adminOrder.includes(to)));
    expect(userOrder).toEqual(fullOrder.filter((to) => userOrder.includes(to)));
  });
});
