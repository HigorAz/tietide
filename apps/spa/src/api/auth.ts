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

// Registration auto-logs the user in: the API returns an access token alongside
// the created user, so the SPA can persist the session without a second request.
export interface RegisterResponse extends PublicUser {
  accessToken: string;
  tokenType: string;
}

export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/login', credentials);
  return data;
}

export async function register(payload: RegisterPayload): Promise<RegisterResponse> {
  const { data } = await api.post<RegisterResponse>('/auth/register', payload);
  return data;
}

export async function getMe(): Promise<PublicUser> {
  const { data } = await api.get<PublicUser>('/auth/me');
  return data;
}
