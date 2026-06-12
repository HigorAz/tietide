import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PublicUser } from '@tietide/shared';

vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
  verifyEmail: vi.fn(),
  getMe: vi.fn(),
}));

vi.mock('@/api/organizations', () => ({
  listOrganizations: vi.fn(),
}));

import {
  login as apiLogin,
  register as apiRegister,
  verifyEmail as apiVerifyEmail,
  getMe as apiGetMe,
} from '@/api/auth';
import { listOrganizations as apiListOrganizations } from '@/api/organizations';
import { useAuthStore, TOKEN_STORAGE_KEY, ACTIVE_ORG_STORAGE_KEY } from './authStore';

const mockedLogin = vi.mocked(apiLogin);
const mockedRegister = vi.mocked(apiRegister);
const mockedVerifyEmail = vi.mocked(apiVerifyEmail);
const mockedGetMe = vi.mocked(apiGetMe);
const mockedListOrganizations = vi.mocked(apiListOrganizations);

const org = (id: string, role: 'SUPERADMIN' | 'ADMIN' | 'MEMBER' | 'VIEWER' = 'MEMBER') => ({
  id,
  name: `Org ${id}`,
  slug: `org-${id}`,
  role,
});

const sampleUser: PublicUser = {
  id: 'user-1',
  email: 'alice@example.com',
  name: 'Alice',
  role: 'USER',
  emailVerified: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const resetStore = (): void => {
  useAuthStore.setState({
    user: null,
    token: null,
    organizations: [],
    activeOrganization: null,
    hydrated: false,
  });
  localStorage.clear();
  sessionStorage.clear();
};

describe('authStore', () => {
  beforeEach(() => {
    resetStore();
    mockedLogin.mockReset();
    mockedRegister.mockReset();
    mockedVerifyEmail.mockReset();
    mockedGetMe.mockReset();
    mockedListOrganizations.mockReset();
    mockedListOrganizations.mockResolvedValue([]);
  });

  describe('login', () => {
    it('should store the token in state and localStorage and hydrate the user on success', async () => {
      mockedLogin.mockResolvedValueOnce({ accessToken: 'jwt-123', tokenType: 'Bearer' });
      mockedGetMe.mockResolvedValueOnce(sampleUser);

      await useAuthStore.getState().login({ email: 'alice@example.com', password: 'pw' });

      const state = useAuthStore.getState();
      expect(state.token).toBe('jwt-123');
      expect(state.user).toEqual(sampleUser);
      // The session token lives in sessionStorage (W5.43), never localStorage.
      expect(sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBe('jwt-123');
      expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('should not write a token when the login request fails', async () => {
      mockedLogin.mockRejectedValueOnce(new Error('401'));

      await expect(
        useAuthStore.getState().login({ email: 'alice@example.com', password: 'bad' }),
      ).rejects.toThrow('401');

      const state = useAuthStore.getState();
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
      expect(sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
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
      expect(sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
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
      expect(sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBe('jwt-verify');
      expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('does not write a token when verification fails', async () => {
      mockedVerifyEmail.mockRejectedValueOnce(new Error('400'));

      await expect(useAuthStore.getState().verifyEmail('bad')).rejects.toThrow('400');

      expect(useAuthStore.getState().token).toBeNull();
      expect(mockedGetMe).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should clear state and the stored token', () => {
      useAuthStore.setState({ user: sampleUser, token: 'jwt-123' });
      sessionStorage.setItem(TOKEN_STORAGE_KEY, 'jwt-123');

      useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
      expect(sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    });
  });

  describe('hydrate', () => {
    it('should lift the token from sessionStorage into state and fetch the user', async () => {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, 'jwt-123');
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
      sessionStorage.setItem(TOKEN_STORAGE_KEY, 'expired-jwt');
      mockedGetMe.mockRejectedValueOnce(new Error('401 Unauthorized'));

      await useAuthStore.getState().hydrate();

      const state = useAuthStore.getState();
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
      expect(state.hydrated).toBe(true);
      expect(sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    });

    it('loads the membership list and activates the persisted org on hydrate', async () => {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, 'jwt-123');
      localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, 'b');
      mockedGetMe.mockResolvedValueOnce(sampleUser);
      mockedListOrganizations.mockResolvedValueOnce([org('a'), org('b')]);

      await useAuthStore.getState().hydrate();

      const state = useAuthStore.getState();
      expect(state.organizations).toHaveLength(2);
      expect(state.activeOrganization?.id).toBe('b');
    });
  });

  describe('loadOrganizations', () => {
    it('activates the persisted org when the user is still a member', async () => {
      localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, 'b');
      mockedListOrganizations.mockResolvedValueOnce([org('a'), org('b')]);

      await useAuthStore.getState().loadOrganizations();

      expect(useAuthStore.getState().activeOrganization?.id).toBe('b');
      expect(localStorage.getItem(ACTIVE_ORG_STORAGE_KEY)).toBe('b');
    });

    it('falls back to the first membership when there is no persisted org', async () => {
      mockedListOrganizations.mockResolvedValueOnce([org('a'), org('b')]);

      await useAuthStore.getState().loadOrganizations();

      expect(useAuthStore.getState().activeOrganization?.id).toBe('a');
      expect(localStorage.getItem(ACTIVE_ORG_STORAGE_KEY)).toBe('a');
    });

    it('leaves org state untouched on a fetch failure (non-fatal)', async () => {
      useAuthStore.setState({ organizations: [org('a')], activeOrganization: org('a') });
      mockedListOrganizations.mockRejectedValueOnce(new Error('network'));

      await useAuthStore.getState().loadOrganizations();

      expect(useAuthStore.getState().organizations).toHaveLength(1);
      expect(useAuthStore.getState().activeOrganization?.id).toBe('a');
    });
  });

  describe('switchOrganization', () => {
    it('switches the active workspace and persists it', () => {
      useAuthStore.setState({ organizations: [org('a'), org('b')], activeOrganization: org('a') });

      useAuthStore.getState().switchOrganization('b');

      expect(useAuthStore.getState().activeOrganization?.id).toBe('b');
      expect(localStorage.getItem(ACTIVE_ORG_STORAGE_KEY)).toBe('b');
    });

    it('is a no-op for an unknown org id', () => {
      useAuthStore.setState({ organizations: [org('a')], activeOrganization: org('a') });

      useAuthStore.getState().switchOrganization('zzz');

      expect(useAuthStore.getState().activeOrganization?.id).toBe('a');
    });
  });

  describe('handleLostOrgAccess', () => {
    it('drops the active org and falls back to the next membership', () => {
      useAuthStore.setState({ organizations: [org('a'), org('b')], activeOrganization: org('a') });
      localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, 'a');

      useAuthStore.getState().handleLostOrgAccess();

      const state = useAuthStore.getState();
      expect(state.organizations.map((o) => o.id)).toEqual(['b']);
      expect(state.activeOrganization?.id).toBe('b');
      expect(localStorage.getItem(ACTIVE_ORG_STORAGE_KEY)).toBe('b');
    });

    it('clears the active org when no memberships remain', () => {
      useAuthStore.setState({ organizations: [org('a')], activeOrganization: org('a') });
      localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, 'a');

      useAuthStore.getState().handleLostOrgAccess();

      expect(useAuthStore.getState().activeOrganization).toBeNull();
      expect(localStorage.getItem(ACTIVE_ORG_STORAGE_KEY)).toBeNull();
    });
  });
});
