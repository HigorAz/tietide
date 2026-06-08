interface MaybeAxiosError {
  response?: { status?: number; data?: { message?: unknown } };
}

/**
 * Resolve a user-facing message from a settings API failure: prefer the server's
 * own message (e.g. "Current password is incorrect"), special-case rate limiting,
 * and fall back to the supplied default.
 */
export function sectionError(err: unknown, fallback: string): string {
  const r = (err as MaybeAxiosError | null | undefined)?.response;
  if (r?.status === 429) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  const msg = r?.data?.message;
  if (typeof msg === 'string') return msg;
  if (Array.isArray(msg) && typeof msg[0] === 'string') return msg[0];
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
