// Session-token persistence (W5.43 hardening).
//
// SECURITY: the bearer access token is a long-lived (default 7d), fully
// replayable credential. Persisting it in `localStorage` gives any future XSS
// foothold an indefinitely-surviving, cross-tab, cross-browser-session copy of
// the session. We deliberately keep it in `sessionStorage` instead:
//   - it is scoped to a single tab session and wiped when the tab closes,
//   - it is NOT shared with other tabs/windows or across browser restarts,
//   - so the at-rest exposure window shrinks from the full token TTL down to
//     one live tab session.
//
// RESIDUAL RISK: `sessionStorage` is still JS-readable, so this is
// defense-in-depth, NOT a complete fix. The full remediation is an
// httpOnly+Secure+SameSite cookie issued by the API with CSRF protection and
// refresh-token rotation; that requires backend support and is tracked
// separately. Until then this module is the single choke point for token
// storage so the mechanism can be swapped in one place.
const TOKEN_STORAGE_KEY = 'tietide-token';

const store = (): Storage | null => (typeof sessionStorage === 'undefined' ? null : sessionStorage);

export function readToken(): string | null {
  return store()?.getItem(TOKEN_STORAGE_KEY) ?? null;
}

export function writeToken(token: string): void {
  store()?.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearToken(): void {
  store()?.removeItem(TOKEN_STORAGE_KEY);
}
