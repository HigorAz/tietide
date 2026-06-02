import axios, { type AxiosError } from 'axios';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/v1',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('tietide-token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On a 401 for an authenticated session, soft-logout: clearing the auth store makes
// ProtectedRoute reactively redirect to /login WITHOUT a full-page reload (the old
// `window.location.href` threw away all SPA state), and surface a session-expired
// toast. A 401 with no active session (e.g. a failed login attempt) is left for the
// calling page to handle.
export function onResponseRejected(error: AxiosError): Promise<never> {
  if (error.response?.status === 401 && useAuthStore.getState().token) {
    useAuthStore.getState().logout();
    useToastStore.getState().show({
      tone: 'error',
      message: 'Your session has expired. Please sign in again.',
    });
  }
  return Promise.reject(error);
}

api.interceptors.response.use((response) => response, onResponseRejected);
