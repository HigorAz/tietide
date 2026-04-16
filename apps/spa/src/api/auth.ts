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

export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/login', credentials);
  return data;
}

export async function register(payload: RegisterPayload): Promise<PublicUser> {
  const { data } = await api.post<PublicUser>('/auth/register', payload);
  return data;
}

export async function getMe(): Promise<PublicUser> {
  const { data } = await api.get<PublicUser>('/auth/me');
  return data;
}
