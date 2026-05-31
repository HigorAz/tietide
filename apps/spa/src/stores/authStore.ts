import { create } from 'zustand';
import type { PublicUser } from '@tietide/shared';
import {
  login as apiLogin,
  register as apiRegister,
  getMe as apiGetMe,
  type LoginCredentials,
  type RegisterPayload,
} from '@/api/auth';

export const TOKEN_STORAGE_KEY = 'tietide-token';

export interface AuthState {
  user: PublicUser | null;
  token: string | null;
}

export interface AuthActions {
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<PublicUser>;
  logout: () => void;
  hydrate: () => Promise<void>;
}

export type AuthStore = AuthState & AuthActions;

const readStoredToken = (): string | null => {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(TOKEN_STORAGE_KEY);
};

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  token: readStoredToken(),

  login: async (credentials) => {
    const { accessToken } = await apiLogin(credentials);
    localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    set({ token: accessToken });
    const user = await apiGetMe();
    set({ user });
  },

  register: async (payload) => {
    // Auto-login after registration: the API returns an access token, so persist
    // it and hydrate the user exactly like login() instead of bouncing to /login.
    const { accessToken } = await apiRegister(payload);
    localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    set({ token: accessToken });
    const user = await apiGetMe();
    set({ user });
    return user;
  },

  logout: () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    set({ user: null, token: null });
  },

  hydrate: async () => {
    const stored = readStoredToken();
    if (!stored) return;
    if (get().token !== stored) {
      set({ token: stored });
    }
    const user = await apiGetMe();
    set({ user });
  },
}));
