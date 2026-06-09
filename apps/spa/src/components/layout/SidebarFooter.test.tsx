import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

import { useAuthStore } from '@/stores/authStore';
import { SidebarFooter } from './SidebarFooter';

describe('SidebarFooter', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    useAuthStore.setState({ user: null, token: 'jwt-test', logout: vi.fn() });
  });

  it('should render Help, Workspace settings, Account settings, and Sign out in that DOM order', () => {
    render(<SidebarFooter collapsed={false} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
    expect(buttons[0]).toHaveAccessibleName(/help/i);
    expect(buttons[1]).toHaveAccessibleName(/workspace settings/i);
    expect(buttons[2]).toHaveAccessibleName(/account settings/i);
    expect(buttons[3]).toHaveAccessibleName(/sign out/i);
  });

  it('should call useNavigate with /settings when Account settings is clicked', async () => {
    const user = userEvent.setup();
    render(<SidebarFooter collapsed={false} />);
    await user.click(screen.getByRole('button', { name: /account settings/i }));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/settings');
  });

  it('should call useNavigate with /workspace-settings when Workspace settings is clicked', async () => {
    const user = userEvent.setup();
    render(<SidebarFooter collapsed={false} />);
    await user.click(screen.getByRole('button', { name: /workspace settings/i }));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/workspace-settings');
  });

  it('should call authStore.logout and navigate to /login on Sign out', async () => {
    const logoutSpy = vi.fn();
    useAuthStore.setState({ logout: logoutSpy });

    const user = userEvent.setup();
    render(<SidebarFooter collapsed={false} />);
    await user.click(screen.getByRole('button', { name: /sign out/i }));

    expect(logoutSpy).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('should render Help as a stub button that does not navigate', async () => {
    const user = userEvent.setup();
    render(<SidebarFooter collapsed={false} />);
    await user.click(screen.getByRole('button', { name: /help/i }));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should expose icon-only buttons with title attribute when collapsed', () => {
    render(<SidebarFooter collapsed={true} />);
    const help = screen.getByRole('button', { name: /help/i });
    expect(help).toHaveAttribute('title', 'Help');
    const workspaceSettings = screen.getByRole('button', { name: /workspace settings/i });
    expect(workspaceSettings).toHaveAttribute('title', 'Workspace settings');
    const settings = screen.getByRole('button', { name: /account settings/i });
    expect(settings).toHaveAttribute('title', 'Account settings');
    const signOut = screen.getByRole('button', { name: /sign out/i });
    expect(signOut).toHaveAttribute('title', 'Sign out');
  });
});
