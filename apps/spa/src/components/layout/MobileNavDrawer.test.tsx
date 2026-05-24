import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MobileNavDrawer } from './MobileNavDrawer';
import { visibleNavItems } from './navItems';
import { useAuthStore } from '@/stores/authStore';

type StoreUser = { id: string; email: string; name: string; role: string } | null;
const setUser = (user: StoreUser): void => {
  useAuthStore.setState({ user: user as never, token: 'jwt-test' });
};
const adminUser: StoreUser = { id: 'a-1', email: 'a@x.com', name: 'A', role: 'ADMIN' };
const regularUser: StoreUser = { id: 'u-1', email: 'u@x.com', name: 'U', role: 'USER' };

const renderDrawer = (onClose = vi.fn(), open = true, initial = '/dashboard') => {
  render(
    <MemoryRouter initialEntries={[initial]}>
      <MobileNavDrawer open={open} onClose={onClose} />
    </MemoryRouter>,
  );
  return onClose;
};

describe('MobileNavDrawer', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: null, token: 'jwt-test', logout: vi.fn() });
  });

  it('should render nothing when closed', () => {
    renderDrawer(vi.fn(), false);
    expect(screen.queryByRole('dialog', { name: /navigation/i })).toBeNull();
  });

  it('should render the user-visible nav items when open', () => {
    setUser(regularUser);
    renderDrawer();
    const dialog = screen.getByRole('dialog', { name: /navigation/i });
    const expected = visibleNavItems('USER');
    expected.forEach((item) => {
      expect(
        within(dialog).getByRole('button', { name: new RegExp(item.label, 'i') }),
      ).toBeInTheDocument();
    });
  });

  it('should hide admin items for a regular user', () => {
    setUser(regularUser);
    renderDrawer();
    const dialog = screen.getByRole('dialog', { name: /navigation/i });
    expect(within(dialog).queryByRole('button', { name: /admin · env vars/i })).toBeNull();
  });

  it('should show admin items for an admin user', () => {
    setUser(adminUser);
    renderDrawer();
    const dialog = screen.getByRole('dialog', { name: /navigation/i });
    expect(within(dialog).getByRole('button', { name: /admin · env vars/i })).toBeInTheDocument();
  });

  it('should call onClose when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    const onClose = renderDrawer();
    await user.click(screen.getByTestId('mobile-nav-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = renderDrawer();
    await user.click(screen.getByRole('button', { name: /close navigation/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when Escape is pressed', async () => {
    const user = userEvent.setup();
    const onClose = renderDrawer();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when a nav item is selected (route changes)', async () => {
    const user = userEvent.setup();
    const onClose = renderDrawer();
    await user.click(screen.getByRole('button', { name: /workflows/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
