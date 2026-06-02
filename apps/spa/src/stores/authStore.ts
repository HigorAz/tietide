import { create } from 'zustand';
import type { PublicUser } from '@tietide/shared';
import {
  login as apiLogin,
  register as apiRegister,
  verifyEmail as apiVerifyEmail,
  getMe as apiGetMe,
  type LoginCredentials,
  type RegisterPayload,
} from '@/api/auth';

export const TOKEN_STORAGE_KEY = 'tietide-token';

export interface AuthState {
  user: PublicUser | null;
  token: string | null;
  // True once the initial hydrate() has settled (restored the user from a stored
  // token, or determined there is none / it was invalid). ProtectedRoute waits on
  // this so a refresh doesn't bounce a logged-in user to /login before getMe resolves.
  hydrated: boolean;
}

export interface AuthActions {
  login: (credentials: LoginCredentials) => Promise<void>;
  // Registration no longer logs the user in — it triggers a verification email
  // and returns the neutral server message for the UI to display.
  register: (payload: RegisterPayload) => Promise<string>;
  // Verifies the emailed token and establishes the session (auto-login).
  verifyEmail: (token: string) => Promise<void>;
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
  hydrated: false,

  login: async (credentials) => {
    const { accessToken } = await apiLogin(credentials);
    localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    set({ token: accessToken });
    const user = await apiGetMe();
    set({ user });
  },

  register: async (payload) => {
    // No session yet — registration emails a verification link and returns a
    // neutral message. The session is established when the user verifies.
    const { message } = await apiRegister(payload);
    return message;
  },

  verifyEmail: async (token) => {
    // Verifying the emailed token activates the account and returns a session,
    // so persist it and hydrate the user exactly like login() (auto-login).
    const { accessToken } = await apiVerifyEmail(token);
    localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    set({ token: accessToken });
    const user = await apiGetMe();
    set({ user });
  },

  logout: () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    set({ user: null, token: null });
  },

  hydrate: async () => {
    const stored = readStoredToken();
    if (!stored) {
      set({ hydrated: true });
      return;
    }
    if (get().token !== stored) {
      set({ token: stored });
    }
    try {
      const user = await apiGetMe();
      set({ user, hydrated: true });
    } catch {
      // The stored token is invalid/expired — drop it so the guard sends the user
      // to /login instead of leaving them in a half-authenticated state.
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      set({ user: null, token: null, hydrated: true });
    }
  },
}));
