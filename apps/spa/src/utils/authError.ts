interface MaybeAxiosError {
  response?: { status?: number };
  code?: string;
}

/**
 * Maps an auth request failure to a user-facing message, differentiating the cases a
 * single "Something went wrong" hides (W4.4): rate-limiting (429) and a connection
 * failure (no response from the server). Page-specific statuses (login 401, register
 * 409) are handled by the caller before falling back to this.
 */
export function resolveAuthErrorMessage(err: unknown): string {
  const e = err as MaybeAxiosError | null | undefined;
  const status = e?.response?.status;

  if (status === 429) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  // No HTTP response at all (or an explicit network error code) means the request
  // never reached the server — distinguish that from a server-side failure.
  if (status === undefined || e?.code === 'ERR_NETWORK') {
    return 'Cannot reach the server. Check your connection and try again.';
  }
  return 'Something went wrong. Please try again.';
}
