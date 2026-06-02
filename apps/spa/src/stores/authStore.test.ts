import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PublicUser } from '@tietide/shared';

vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
  verifyEmail: vi.fn(),
  getMe: vi.fn(),
}));

import {
  login as apiLogin,
  register as apiRegister,
  verifyEmail as apiVerifyEmail,
  getMe as apiGetMe,
} from '@/api/auth';
import { useAuthStore, TOKEN_STORAGE_KEY } from './authStore';

const mockedLogin = vi.mocked(apiLogin);
const mockedRegister = vi.mocked(apiRegister);
const mockedVerifyEmail = vi.mocked(apiVerifyEmail);
const mockedGetMe = vi.mocked(apiGetMe);

const sampleUser: PublicUser = {
  id: 'user-1',
  email: 'alice@example.com',
  name: 'Alice',
  role: 'USER',
};

const resetStore = (): void => {
  useAuthStore.setState({ user: null, token: null, hydrated: false });
  localStorage.clear();
};

describe('authStore', () => {
  beforeEach(() => {
    resetStore();
    mockedLogin.mockReset();
    mockedRegister.mockReset();
    mockedVerifyEmail.mockReset();
    mockedGetMe.mockReset();
  });

  describe('login', () => {
    it('should store the token in state and localStorage and hydrate the user on success', async () => {
      mockedLogin.mockResolvedValueOnce({ accessToken: 'jwt-123', tokenType: 'Bearer' });
      mockedGetMe.mockResolvedValueOnce(sampleUser);

      await useAuthStore.getState().login({ email: 'alice@example.com', password: 'pw' });

      const state = useAuthStore.getState();
      expect(state.token).toBe('jwt-123');
      expect(state.user).toEqual(sampleUser);
      expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('jwt-123');
    });

    it('should not write a token when the login request fails', async () => {
      mockedLogin.mockRejectedValueOnce(new Error('401'));

      await expect(
        useAuthStore.getState().login({ email: 'alice@example.com', password: 'bad' }),
      ).rejects.toThrow('401');

      const state = useAuthStore.getState();
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
      expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
      expect(mockedGetMe).not.toHaveBeenCalled();
    });
  });

  describe('register', () => {
    it('does NOT log in — returns the neutral message and never sets a token', async () => {
      mockedRegister.mockResolvedValueOnce({ message: 'check your inbox' });

      const result = await useAuthStore
        .getState()
        .register({ name: 'Alice', email: 'alice@example.com', password: 'password123' });

      expect(result).toBe('check your inbox');
      const state = useAuthStore.getState();
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
      expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
      expect(mockedGetMe).not.toHaveBeenCalled();
    });

    it('should propagate errors without touching state', async () => {
      const err = new Error('500');
      mockedRegister.mockRejectedValueOnce(err);

      await expect(
        useAuthStore
          .getState()
          .register({ name: 'Alice', email: 'taken@example.com', password: 'password123' }),
      ).rejects.toBe(err);

      expect(useAuthStore.getState().token).toBeNull();
    });
  });

  describe('verifyEmail', () => {
    it('stores the token + hydrates the user on success (auto-login)', async () => {
      mockedVerifyEmail.mockResolvedValueOnce({ accessToken: 'jwt-verify', tokenType: 'Bearer' });
      mockedGetMe.mockResolvedValueOnce(sampleUser);

      await useAuthStore.getState().verifyEmail('a-token');

      const state = useAuthStore.getState();
      expect(mockedVerifyEmail).toHaveBeenCalledWith('a-token');
      expect(state.token).toBe('jwt-verify');
      expect(state.user).toEqual(sampleUser);
      expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe('jwt-verify');
    });

    it('does not write a token when verification fails', async () => {
      mockedVerifyEmail.mockRejectedValueOnce(new Error('400'));

      await expect(useAuthStore.getState().verifyEmail('bad')).rejects.toThrow('400');

      expect(useAuthStore.getState().token).toBeNull();
      expect(mockedGetMe).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should clear state and localStorage', () => {
      useAuthStore.setState({ user: sampleUser, token: 'jwt-123' });
      localStorage.setItem(TOKEN_STORAGE_KEY, 'jwt-123');

      useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
      expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    });
  });

  describe('hydrate', () => {
    it('should lift the token from localStorage into state and fetch the user', async () => {
      localStorage.setItem(TOKEN_STORAGE_KEY, 'jwt-123');
      mockedGetMe.mockResolvedValueOnce(sampleUser);

      await useAuthStore.getState().hydrate();

      const state = useAuthStore.getState();
      expect(state.token).toBe('jwt-123');
      expect(state.user).toEqual(sampleUser);
      expect(state.hydrated).toBe(true);
    });

    it('should be a no-op when no token is stored, but still mark hydrated', async () => {
      await useAuthStore.getState().hydrate();

      expect(mockedGetMe).not.toHaveBeenCalled();
      expect(useAuthStore.getState().token).toBeNull();
      expect(useAuthStore.getState().hydrated).toBe(true);
    });

    it('should drop an invalid stored token (and mark hydrated) when getMe fails', async () => {
      localStorage.setItem(TOKEN_STORAGE_KEY, 'expired-jwt');
      mockedGetMe.mockRejectedValueOnce(new Error('401 Unauthorized'));

      await useAuthStore.getState().hydrate();

      const state = useAuthStore.getState();
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
      expect(state.hydrated).toBe(true);
      expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    });
  });
});
