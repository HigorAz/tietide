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

export interface ForgotPasswordResponse {
  message: string;
}

// Requests a password-reset link. Always resolves with a neutral message (the API
// never reveals whether the email is registered).
export async function forgotPassword(email: string): Promise<ForgotPasswordResponse> {
  const { data } = await api.post<ForgotPasswordResponse>('/auth/forgot-password', { email });
  return data;
}

// Consumes the single-use reset token, sets the new password, and returns a fresh
// session (this is where auto-login after reset happens).
export async function resetPassword(token: string, password: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/reset-password', { token, password });
  return data;
}

export interface MessageResponse {
  message: string;
}

// Updates the display name and returns the refreshed public profile.
export async function updateProfile(name: string): Promise<PublicUser> {
  const { data } = await api.patch<PublicUser>('/auth/profile', { name });
  return data;
}

// Changes the password (current password required). Revokes every other session
// and returns a fresh token so the calling device stays signed in.
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<LoginResponse> {
  const { data } = await api.patch<LoginResponse>('/auth/password', {
    currentPassword,
    newPassword,
  });
  return data;
}

// Requests a fresh verification email. Always resolves with a neutral message.
export async function resendVerification(email: string): Promise<MessageResponse> {
  const { data } = await api.post<MessageResponse>('/auth/resend-verification', { email });
  return data;
}

// Revokes every outstanding session for the current user (bumps tokenVersion).
export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

// Permanently deletes (anonymizes) the current account. Requires the password.
export async function deleteAccount(password: string): Promise<void> {
  await api.delete('/auth/account', { data: { password } });
}
