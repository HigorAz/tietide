import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { initialToastState, useToastStore } from '@/stores/toastStore';
import { ResetPasswordPage } from './ResetPasswordPage';

const initialAuthState = useAuthStore.getState();

const resetStore = (): void => {
  useAuthStore.setState(initialAuthState, true);
  useToastStore.setState({ ...initialToastState });
  localStorage.clear();
};

const renderPage = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/" element={<div>Home Screen</div>} />
        <Route path="/login" element={<div>Login Screen</div>} />
        <Route path="/forgot-password" element={<div>Forgot Screen</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();
  });

  it('renders a new-password input and a submit button when a token is present', () => {
    renderPage('/reset-password?token=tok-123');

    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset password|reset/i })).toBeInTheDocument();
  });

  it('calls resetPassword with the token + password and enters the app on success', async () => {
    const resetMock = vi.fn().mockResolvedValueOnce(undefined);
    useAuthStore.setState({ resetPassword: resetMock });
    const user = userEvent.setup();

    renderPage('/reset-password?token=tok-123');

    await user.type(screen.getByLabelText(/password/i), 'newpassword1');
    await user.click(screen.getByRole('button', { name: /reset password|reset/i }));

    await waitFor(() => expect(resetMock).toHaveBeenCalledWith('tok-123', 'newpassword1'));
    await waitFor(() => expect(screen.getByText('Home Screen')).toBeInTheDocument());
  });

  it('toasts an invalid/expired message when the reset fails with 400', async () => {
    const axiosError = Object.assign(new Error('Bad Request'), {
      isAxiosError: true,
      response: { status: 400 },
    });
    useAuthStore.setState({ resetPassword: vi.fn().mockRejectedValueOnce(axiosError) });
    const user = userEvent.setup();

    renderPage('/reset-password?token=expired');

    await user.type(screen.getByLabelText(/password/i), 'newpassword1');
    await user.click(screen.getByRole('button', { name: /reset password|reset/i }));

    await waitFor(() => {
      const toasts = useToastStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0].message).toMatch(/invalid or has expired/i);
    });
    expect(screen.queryByText('Home Screen')).not.toBeInTheDocument();
  });

  it('shows an invalid-link screen (and no form) when the token is missing', () => {
    const resetMock = vi.fn();
    useAuthStore.setState({ resetPassword: resetMock });

    renderPage('/reset-password');

    expect(screen.getByText(/reset link invalid/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    const link = screen.getByRole('link', { name: /request a new link/i });
    expect(link).toHaveAttribute('href', '/forgot-password');
  });

  it('shows a validation error for a weak password without calling resetPassword', async () => {
    const resetMock = vi.fn();
    useAuthStore.setState({ resetPassword: resetMock });
    const user = userEvent.setup();

    renderPage('/reset-password?token=tok-123');

    await user.type(screen.getByLabelText(/password/i), 'short');
    await user.click(screen.getByRole('button', { name: /reset password|reset/i }));

    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(resetMock).not.toHaveBeenCalled();
  });
});
