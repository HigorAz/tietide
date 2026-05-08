import { ConnectionAuthError } from '@tietide/sdk';

interface AuthErrorLike {
  status?: number;
  statusCode?: number;
  response?: { status?: number };
}

export function isGoogleAuthError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  const e = error as AuthErrorLike;
  const status = e.status ?? e.statusCode ?? e.response?.status;
  return status === 401 || status === 403;
}

export interface WrapAuthErrorOptions {
  connectionId: string;
  provider: string;
}

export function wrapGoogleAuthError(
  cause: unknown,
  { connectionId, provider }: WrapAuthErrorOptions,
): ConnectionAuthError {
  return new ConnectionAuthError(
    `Connection "${connectionId}" returned auth error; marked for refresh`,
    { connectionId, provider, cause },
  );
}
