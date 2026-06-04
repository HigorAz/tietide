import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { initialToastState, useToastStore } from '@/stores/toastStore';
import { ForgotPasswordPage } from './ForgotPasswordPage';

const initialAuthState = useAuthStore.getState();

const resetStore = (): void => {
  useAuthStore.setState(initialAuthState, true);
  useToastStore.setState({ ...initialToastState });
  localStorage.clear();
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/login" element={<div>Login Screen</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();
  });

  it('renders an email input and a submit button', () => {
    renderPage();

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link|send/i })).toBeInTheDocument();
  });

  it('calls forgotPassword and shows a neutral confirmation (no enumeration)', async () => {
    const forgotMock = vi.fn().mockResolvedValueOnce('neutral message');
    useAuthStore.setState({ forgotPassword: forgotMock });
    const user = userEvent.setup();

    renderPage();

    await user.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link|send/i }));

    await waitFor(() => expect(forgotMock).toHaveBeenCalledWith('alice@example.com'));
    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument();
    // The confirmation is the same regardless of whether the email exists.
    expect(screen.getByText(/is registered/i)).toBeInTheDocument();
  });

  it('toasts an actionable error and stays on the form when the request fails', async () => {
    const networkError = Object.assign(new Error('Network Error'), {
      isAxiosError: true,
      code: 'ERR_NETWORK',
    });
    useAuthStore.setState({ forgotPassword: vi.fn().mockRejectedValueOnce(networkError) });
    const user = userEvent.setup();

    renderPage();

    await user.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link|send/i }));

    await waitFor(() => {
      const toasts = useToastStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0]).toMatchObject({ tone: 'error' });
    });
    expect(screen.queryByText(/check your inbox/i)).not.toBeInTheDocument();
  });

  it('shows a validation error for an invalid email without calling forgotPassword', async () => {
    const forgotMock = vi.fn();
    useAuthStore.setState({ forgotPassword: forgotMock });
    const user = userEvent.setup();

    renderPage();

    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /send reset link|send/i }));

    expect(await screen.findByText(/invalid email/i)).toBeInTheDocument();
    expect(forgotMock).not.toHaveBeenCalled();
  });

  it('links back to the login page', () => {
    renderPage();

    const link = screen.getByRole('link', { name: /sign in|log in|login/i });
    expect(link).toHaveAttribute('href', '/login');
  });
});
