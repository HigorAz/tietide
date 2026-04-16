import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { PublicUser } from '@tietide/shared';
import { useAuthStore } from '@/stores/authStore';
import { RegisterPage } from './RegisterPage';

const sampleUser: PublicUser = {
  id: 'user-1',
  email: 'alice@example.com',
  name: 'Alice',
  role: 'USER',
};

const resetStore = (): void => {
  useAuthStore.setState({ user: null, token: null });
  localStorage.clear();
};

const renderRegister = () =>
  render(
    <MemoryRouter initialEntries={['/register']}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<div>Login Screen</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('RegisterPage', () => {
  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();
  });

  it('should render name, email, and password inputs and a submit button', () => {
    renderRegister();

    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /create account|sign up|register/i }),
    ).toBeInTheDocument();
  });

  it('should call authStore.register and navigate to /login on success', async () => {
    const registerSpy = vi
      .spyOn(useAuthStore.getState(), 'register')
      .mockResolvedValueOnce(sampleUser);
    const user = userEvent.setup();

    renderRegister();

    await user.type(screen.getByLabelText(/name/i), 'Alice');
    await user.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create account|sign up|register/i }));

    await waitFor(() => {
      expect(registerSpy).toHaveBeenCalledWith({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'password123',
      });
    });
    await waitFor(() => {
      expect(screen.getByText('Login Screen')).toBeInTheDocument();
    });
  });

  it('should render an email-already-registered error on 409 responses', async () => {
    const axiosError = Object.assign(new Error('Conflict'), {
      isAxiosError: true,
      response: { status: 409 },
    });
    vi.spyOn(useAuthStore.getState(), 'register').mockRejectedValueOnce(axiosError);
    const user = userEvent.setup();

    renderRegister();

    await user.type(screen.getByLabelText(/name/i), 'Alice');
    await user.type(screen.getByLabelText(/email/i), 'taken@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create account|sign up|register/i }));

    expect(await screen.findByText(/email already registered/i)).toBeInTheDocument();
    expect(screen.queryByText('Login Screen')).not.toBeInTheDocument();
  });

  it('should show a validation error for a short password without calling authStore.register', async () => {
    const registerSpy = vi.spyOn(useAuthStore.getState(), 'register');
    const user = userEvent.setup();

    renderRegister();

    await user.type(screen.getByLabelText(/name/i), 'Alice');
    await user.type(screen.getByLabelText(/email/i), 'alice@example.com');
    await user.type(screen.getByLabelText(/password/i), 'short');
    await user.click(screen.getByRole('button', { name: /create account|sign up|register/i }));

    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(registerSpy).not.toHaveBeenCalled();
  });

  it('should link to the login page', () => {
    renderRegister();

    const link = screen.getByRole('link', { name: /sign in|log in|login/i });
    expect(link).toHaveAttribute('href', '/login');
  });
});
