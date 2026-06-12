import { describe, it, expect, beforeEach } from 'vitest';
import { readToken, writeToken, clearToken } from './tokenStorage';

const TOKEN_STORAGE_KEY = 'tietide-token';

describe('tokenStorage (W5.43 — keep the session token out of localStorage)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('persists the token to sessionStorage, NOT localStorage', () => {
    writeToken('jwt-123');

    // Security regression guard: a future XSS must not be able to lift a
    // long-lived token out of the cross-tab / cross-session localStorage plane.
    expect(sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBe('jwt-123');
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('reads the token back from sessionStorage', () => {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, 'jwt-abc');

    expect(readToken()).toBe('jwt-abc');
  });

  it('does NOT read a stray token from localStorage', () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, 'legacy-jwt');

    expect(readToken()).toBeNull();
  });

  it('clears the token from sessionStorage', () => {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, 'jwt-xyz');

    clearToken();

    expect(readToken()).toBeNull();
    expect(sessionStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('returns null when no token is stored', () => {
    expect(readToken()).toBeNull();
  });
});
