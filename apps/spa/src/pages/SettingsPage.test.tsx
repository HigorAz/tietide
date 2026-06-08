import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { PublicUser } from '@tietide/shared';
import { useAuthStore } from '@/stores/authStore';
import { initialToastState, useToastStore } from '@/stores/toastStore';
import { SettingsPage } from './SettingsPage';

const initialAuthState = useAuthStore.getState();

const baseUser: PublicUser = {
  id: 'u1',
  email: 'alice@example.com',
  name: 'Alice',
  role: 'USER',
  emailVerified: true,
  createdAt: '2026-04-15T00:00:00Z' as unknown as Date,
};

const seedStore = (user: PublicUser, overrides: Record<string, unknown> = {}): void => {
  useAuthStore.setState(initialAuthState, true);
  useAuthStore.setState({
    user,
    updateProfile: vi.fn().mockResolvedValue(undefined),
    changePassword: vi.fn().mockResolvedValue(undefined),
    resendVerification: vi.fn().mockResolvedValue('Neutral message.'),
    logoutEverywhere: vi.fn().mockResolvedValue(undefined),
    deleteAccount: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });
  useToastStore.setState({ ...initialToastState });
  localStorage.clear();
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/login" element={<div>Login Screen</div>} />
        <Route path="/connections" element={<div>Connections Screen</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('SettingsPage', () => {
  beforeEach(() => {
    seedStore(baseUser);
    vi.restoreAllMocks();
  });

  it('renders the Profile, Security, Workspace and Danger sections', () => {
    seedStore(baseUser);
    renderPage();

    expect(screen.getByRole('region', { name: /profile/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /security/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /workspace/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /danger zone/i })).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('calls updateProfile with the edited display name', async () => {
    const updateProfile = vi.fn().mockResolvedValue(undefined);
    seedStore(baseUser, { updateProfile });
    const user = userEvent.setup();
    renderPage();

    const nameInput = screen.getByLabelText(/display name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Alice Cooper');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith('Alice Cooper'));
  });

  it('validates the password form and does not call changePassword when the new password is weak', async () => {
    const changePassword = vi.fn().mockResolvedValue(undefined);
    seedStore(baseUser, { changePassword });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/current password/i), 'oldpass123');
    await user.type(screen.getByLabelText(/new password/i), 'weak');
    await user.click(screen.getByRole('button', { name: /change password/i }));

    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('calls changePassword with a valid current + new password', async () => {
    const changePassword = vi.fn().mockResolvedValue(undefined);
    seedStore(baseUser, { changePassword });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/current password/i), 'oldpass123');
    await user.type(screen.getByLabelText(/new password/i), 'newpass123');
    await user.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => expect(changePassword).toHaveBeenCalledWith('oldpass123', 'newpass123'));
  });

  it('calls logoutEverywhere and redirects to /login', async () => {
    const logoutEverywhere = vi.fn().mockResolvedValue(undefined);
    seedStore(baseUser, { logoutEverywhere });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /log out everywhere/i }));

    await waitFor(() => expect(logoutEverywhere).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('Login Screen')).toBeInTheDocument());
  });

  it('shows a resend-verification button for an unverified email and calls the action', async () => {
    const resendVerification = vi.fn().mockResolvedValue('Neutral message.');
    seedStore({ ...baseUser, emailVerified: false }, { resendVerification });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /resend verification/i }));

    await waitFor(() => expect(resendVerification).toHaveBeenCalledWith('alice@example.com'));
  });

  it('requires a password before deleting and calls deleteAccount with it', async () => {
    const deleteAccount = vi.fn().mockResolvedValue(undefined);
    seedStore(baseUser, { deleteAccount });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /^delete account$/i }));

    const dialog = screen.getByRole('dialog', { name: /confirm account deletion/i });
    const confirm = within(dialog).getByRole('button', { name: /delete account/i });
    // Disabled until a password is entered.
    expect(confirm).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/password/i), 'rightpass');
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith('rightpass'));
    await waitFor(() => expect(screen.getByText('Login Screen')).toBeInTheDocument());
  });
});
