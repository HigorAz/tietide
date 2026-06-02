import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { VerifyEmailPage } from './VerifyEmailPage';

const initialAuthState = useAuthStore.getState();

const resetStore = (): void => {
  useAuthStore.setState(initialAuthState, true);
  localStorage.clear();
};

const renderVerify = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/" element={<div>Dashboard Screen</div>} />
        <Route path="/login" element={<div>Login Screen</div>} />
        <Route path="/register" element={<div>Register Screen</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();
  });

  it('verifies the token from the URL and enters the app on success', async () => {
    const verifyMock = vi.fn().mockResolvedValueOnce(undefined);
    useAuthStore.setState({ verifyEmail: verifyMock });

    renderVerify('/verify-email?token=tok-123');

    await waitFor(() => expect(verifyMock).toHaveBeenCalledWith('tok-123'));
    await waitFor(() => expect(screen.getByText('Dashboard Screen')).toBeInTheDocument());
  });

  it('shows an invalid-link message when verification fails', async () => {
    const verifyMock = vi.fn().mockRejectedValueOnce(new Error('400'));
    useAuthStore.setState({ verifyEmail: verifyMock });

    renderVerify('/verify-email?token=expired');

    expect(await screen.findByText(/invalid or has expired/i)).toBeInTheDocument();
    expect(screen.queryByText('Dashboard Screen')).not.toBeInTheDocument();
  });

  it('shows the invalid-link message and never calls verify when no token is present', async () => {
    const verifyMock = vi.fn();
    useAuthStore.setState({ verifyEmail: verifyMock });

    renderVerify('/verify-email');

    expect(await screen.findByText(/invalid or has expired/i)).toBeInTheDocument();
    expect(verifyMock).not.toHaveBeenCalled();
  });
});
