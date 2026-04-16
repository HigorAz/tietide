import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { LoginPage } from './LoginPage';

const resetStore = (): void => {
  useAuthStore.setState({ user: null, token: null });
  localStorage.clear();
};

const renderLogin = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<div>Register Screen</div>} />
        <Route path="/dashboard" element={<div>Dashboard Screen</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('LoginPage', () => {
  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();
  });

  it('should render email and password inputs and a submit button', () => {
    renderLogin();

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('should call authStore.login with form values and navigate to /dashboard on success', async () => {
    const loginSpy = vi.spyOn(useAuthStore.getState(), 'login').mockResolvedValueOnce();
    const user = userEvent.setup();

    renderLogin();

    await user.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(loginSpy).toHaveBeenCalledWith({
        email: 'alice@example.com',
        password: 'password123',
      });
    });
    await waitFor(() => {
      expect(screen.getByText('Dashboard Screen')).toBeInTheDocument();
    });
  });

  it('should render a generic invalid credentials error when login fails with 401', async () => {
    const axiosError = Object.assign(new Error('Request failed'), {
      isAxiosError: true,
      response: { status: 401 },
    });
    vi.spyOn(useAuthStore.getState(), 'login').mockRejectedValueOnce(axiosError);
    const user = userEvent.setup();

    renderLogin();

    await user.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument();
    expect(screen.queryByText('Dashboard Screen')).not.toBeInTheDocument();
  });

  it('should show a validation error for an invalid email without calling authStore.login', async () => {
    const loginSpy = vi.spyOn(useAuthStore.getState(), 'login');
    const user = userEvent.setup();

    renderLogin();

    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/invalid email/i)).toBeInTheDocument();
    expect(loginSpy).not.toHaveBeenCalled();
  });

  it('should link to the register page', () => {
    renderLogin();

    const link = screen.getByRole('link', { name: /register|create an account|sign up/i });
    expect(link).toHaveAttribute('href', '/register');
  });
});
