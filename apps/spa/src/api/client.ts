import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore, ACTIVE_ORG_STORAGE_KEY } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/v1',
  headers: { 'Content-Type': 'application/json' },
});

// Attach the bearer token and the active-workspace header to every request. The
// X-Org-Id header is what scopes the API to the user's selected workspace.
export function attachRequestHeaders(
  config: InternalAxiosRequestConfig,
): InternalAxiosRequestConfig {
  const token = localStorage.getItem('tietide-token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const orgId = localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
  if (orgId) {
    config.headers['X-Org-Id'] = orgId;
  }
  return config;
}

api.interceptors.request.use(attachRequestHeaders);

// A 403 from the org-context guard means the active workspace is no longer
// accessible (membership revoked, or the org was deleted). Distinguished from an
// ordinary role 403 ("Insufficient organization role") by message so a VIEWER
// hitting a mutation is left for the page to handle.
const ORG_ACCESS_LOST = /member of this organization|organization context/i;

// A 401 carrying this `reason` is a deliberate credential rejection on an
// authenticated endpoint (wrong current password on change-password, wrong
// password on delete-account) — NOT an expired session. The page that made the
// call surfaces the message itself, so the interceptor must leave the session
// intact instead of force-logging-out. Kept in sync with the API's
// INVALID_CREDENTIALS_REASON (account.service.ts).
const INVALID_CREDENTIALS_REASON = 'invalid_credentials';

// 402 plan-limit messages, keyed by the `reason` the API attaches. Shows a
// targeted upgrade prompt; call sites may also catch 402 for an inline CTA.
const PLAN_LIMIT_MESSAGES: Record<string, string> = {
  seats: 'You’ve reached your plan’s seat limit. Upgrade to add more members.',
  workspaces: 'You’ve reached the free workspace limit. Upgrade an existing workspace to add more.',
  runs: 'This workspace has used its included runs. Upgrade to keep running workflows.',
  workflows: 'You’ve reached your plan’s workflow limit. Upgrade to add more.',
};

// On a 401 for an authenticated session, soft-logout: clearing the auth store makes
// ProtectedRoute reactively redirect to /login WITHOUT a full-page reload (the old
// `window.location.href` threw away all SPA state), and surface a session-expired
// toast. A 401 with no active session (e.g. a failed login attempt) is left for the
// calling page to handle.
export function onResponseRejected(error: AxiosError): Promise<never> {
  const status = error.response?.status;

  if (status === 401 && useAuthStore.getState().token) {
    const reason = (error.response?.data as { reason?: string } | undefined)?.reason;
    // A wrong-password rejection is not a stale session — let the calling page
    // show the error and keep the user signed in.
    if (reason !== INVALID_CREDENTIALS_REASON) {
      useAuthStore.getState().logout();
      useToastStore.getState().show({
        tone: 'error',
        message: 'Your session has expired. Please sign in again.',
      });
    }
  }

  if (status === 403 && useAuthStore.getState().token) {
    const message = (error.response?.data as { message?: string } | undefined)?.message ?? '';
    if (ORG_ACCESS_LOST.test(message)) {
      // Drop the inaccessible workspace and fall back to another membership so the
      // user lands somewhere valid instead of a wall of 403s.
      useAuthStore.getState().handleLostOrgAccess();
      useToastStore.getState().show({
        tone: 'error',
        message: 'You no longer have access to that workspace.',
      });
    }
  }

  if (status === 402 && useAuthStore.getState().token) {
    const reason = (error.response?.data as { reason?: string } | undefined)?.reason ?? '';
    useToastStore.getState().show({
      tone: 'error',
      message: PLAN_LIMIT_MESSAGES[reason] ?? 'Upgrade your plan to continue.',
    });
  }

  return Promise.reject(error);
}

api.interceptors.response.use((response) => response, onResponseRejected);
