import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar, SIDEBAR_STORAGE_KEY } from './Sidebar';
import { navItems } from './navItems';
import { useAuthStore } from '@/stores/authStore';

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
    it('should render all six nav items in the configured order', () => {
      renderAt();
      const nav = screen.getByRole('navigation', { name: /main navigation/i });
      const buttons = within(nav).getAllByRole('button');
      expect(buttons).toHaveLength(navItems.length);
      navItems.forEach((item, idx) => {
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
});
