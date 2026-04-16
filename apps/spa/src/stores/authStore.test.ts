import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PublicUser } from '@tietide/shared';

vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
  getMe: vi.fn(),
}));

import { login as apiLogin, register as apiRegister, getMe as apiGetMe } from '@/api/auth';
import { useAuthStore, TOKEN_STORAGE_KEY } from './authStore';

const mockedLogin = vi.mocked(apiLogin);
const mockedRegister = vi.mocked(apiRegister);
const mockedGetMe = vi.mocked(apiGetMe);

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

describe('authStore', () => {
  beforeEach(() => {
    resetStore();
    mockedLogin.mockReset();
    mockedRegister.mockReset();
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
    it('should return the created user without storing a token', async () => {
      mockedRegister.mockResolvedValueOnce(sampleUser);

      const result = await useAuthStore
        .getState()
        .register({ name: 'Alice', email: 'alice@example.com', password: 'password123' });

      expect(result).toEqual(sampleUser);
      const state = useAuthStore.getState();
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
      expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('should propagate errors (e.g. 409 duplicate email) without touching state', async () => {
      const err = new Error('409');
      mockedRegister.mockRejectedValueOnce(err);

      await expect(
        useAuthStore
          .getState()
          .register({ name: 'Alice', email: 'taken@example.com', password: 'password123' }),
      ).rejects.toBe(err);

      expect(useAuthStore.getState().token).toBeNull();
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
    });

    it('should be a no-op when no token is stored', async () => {
      await useAuthStore.getState().hydrate();

      expect(mockedGetMe).not.toHaveBeenCalled();
      expect(useAuthStore.getState().token).toBeNull();
    });
  });
});
