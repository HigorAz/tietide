import type { PublicUser } from '@tietide/shared';
import { api } from './client';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: string;
}

// Registration no longer returns a session: the API emails a verification link
// and responds with a neutral message (so it can't be used to enumerate
// accounts). The session is issued when the user verifies via the emailed link.
export interface RegisterResponse {
  message: string;
}

export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/login', credentials);
  return data;
}

export async function register(payload: RegisterPayload): Promise<RegisterResponse> {
  const { data } = await api.post<RegisterResponse>('/auth/register', payload);
  return data;
}

// Verifies an email via the single-use token from the emailed link, activating
// the account and returning a session (this is where auto-login now happens).
export async function verifyEmail(token: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/verify-email', { token });
  return data;
}

export async function getMe(): Promise<PublicUser> {
  const { data } = await api.get<PublicUser>('/auth/me');
  return data;
}
