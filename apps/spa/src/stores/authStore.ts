import { create } from 'zustand';
import type { PublicUser } from '@tietide/shared';
import {
  login as apiLogin,
  register as apiRegister,
  verifyEmail as apiVerifyEmail,
  forgotPassword as apiForgotPassword,
  resetPassword as apiResetPassword,
  getMe as apiGetMe,
  type LoginCredentials,
  type RegisterPayload,
} from '@/api/auth';
import {
  listOrganizations as apiListOrganizations,
  type OrganizationSummary,
} from '@/api/organizations';

export const TOKEN_STORAGE_KEY = 'tietide-token';
// The workspace the SPA scopes requests to, echoed as the X-Org-Id header by the
// API client. Persisted so a refresh keeps the same active workspace.
export const ACTIVE_ORG_STORAGE_KEY = 'tietide-active-org';

export interface AuthState {
  user: PublicUser | null;
  token: string | null;
  // The workspaces the user belongs to, and the one currently active (drives the
  // org switcher and the X-Org-Id header). Loaded alongside the user.
  organizations: OrganizationSummary[];
  activeOrganization: OrganizationSummary | null;
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
  // Requests a reset link; returns the neutral server message for the UI.
  forgotPassword: (email: string) => Promise<string>;
  // Consumes the reset token, sets the new password, and establishes the session.
  resetPassword: (token: string, password: string) => Promise<void>;
  logout: () => void;
  hydrate: () => Promise<void>;
  // Refresh the membership list and reconcile the active workspace (the persisted
  // one if still a member, else the first available, else none).
  loadOrganizations: () => Promise<void>;
  // Switch the active workspace and persist it (no-op for an unknown id).
  switchOrganization: (orgId: string) => void;
  // The active workspace is no longer accessible (a 403 from the org guard): drop
  // it and fall back to the next available membership.
  handleLostOrgAccess: () => void;
}

export type AuthStore = AuthState & AuthActions;

const readStoredToken = (): string | null => {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(TOKEN_STORAGE_KEY);
};

const readStoredActiveOrgId = (): string | null => {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
};

const persistActiveOrg = (org: OrganizationSummary | null): void => {
  if (typeof localStorage === 'undefined') return;
  if (org) localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, org.id);
  else localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
};

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  token: readStoredToken(),
  organizations: [],
  activeOrganization: null,
  hydrated: false,

  login: async (credentials) => {
    const { accessToken } = await apiLogin(credentials);
    localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    set({ token: accessToken });
    const user = await apiGetMe();
    set({ user });
    await get().loadOrganizations();
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
    await get().loadOrganizations();
  },

  forgotPassword: async (email) => {
    // Neutral message regardless of whether the email exists — no session change.
    const { message } = await apiForgotPassword(email);
    return message;
  },

  resetPassword: async (token, password) => {
    // Consuming the reset token returns a fresh session, so persist it and hydrate
    // the user exactly like login()/verifyEmail() (auto-login after reset).
    const { accessToken } = await apiResetPassword(token, password);
    localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    set({ token: accessToken });
    const user = await apiGetMe();
    set({ user });
    await get().loadOrganizations();
  },

  logout: () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
    set({ user: null, token: null, organizations: [], activeOrganization: null });
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
      set({ user });
      await get().loadOrganizations();
      set({ hydrated: true });
    } catch {
      // The stored token is invalid/expired — drop it so the guard sends the user
      // to /login instead of leaving them in a half-authenticated state.
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
      set({ user: null, token: null, organizations: [], activeOrganization: null, hydrated: true });
    }
  },

  loadOrganizations: async () => {
    try {
      const organizations = await apiListOrganizations();
      const storedId = readStoredActiveOrgId();
      const active = organizations.find((o) => o.id === storedId) ?? organizations[0] ?? null;
      persistActiveOrg(active);
      set({ organizations, activeOrganization: active });
    } catch {
      // Non-fatal — leave the existing org state untouched so a transient failure
      // doesn't blank the switcher.
    }
  },

  switchOrganization: (orgId) => {
    const org = get().organizations.find((o) => o.id === orgId);
    if (!org) return;
    persistActiveOrg(org);
    set({ activeOrganization: org });
  },

  handleLostOrgAccess: () => {
    const lostId = get().activeOrganization?.id;
    const remaining = get().organizations.filter((o) => o.id !== lostId);
    const next = remaining[0] ?? null;
    persistActiveOrg(next);
    set({ organizations: remaining, activeOrganization: next });
  },
}));
