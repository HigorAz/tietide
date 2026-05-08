import { ConnectionAuthError } from '@tietide/sdk';
import { isGoogleAuthError, wrapGoogleAuthError } from './google-error';

describe('google-error', () => {
  describe('isGoogleAuthError', () => {
    it('returns true for status 401', () => {
      expect(isGoogleAuthError({ response: { status: 401 } })).toBe(true);
    });

    it('returns true for status 403', () => {
      expect(isGoogleAuthError({ response: { status: 403 } })).toBe(true);
    });

    it('returns true when status lives on top-level field', () => {
      expect(isGoogleAuthError({ status: 401 })).toBe(true);
      expect(isGoogleAuthError({ statusCode: 403 })).toBe(true);
    });

    it('returns false for non-auth statuses', () => {
      expect(isGoogleAuthError({ response: { status: 400 } })).toBe(false);
      expect(isGoogleAuthError({ response: { status: 500 } })).toBe(false);
      expect(isGoogleAuthError({ status: 404 })).toBe(false);
    });

    it('returns false for non-objects', () => {
      expect(isGoogleAuthError(null)).toBe(false);
      expect(isGoogleAuthError(undefined)).toBe(false);
      expect(isGoogleAuthError('boom')).toBe(false);
      expect(isGoogleAuthError(401)).toBe(false);
    });
  });

  describe('wrapGoogleAuthError', () => {
    it('wraps the original error in a ConnectionAuthError preserving the cause', () => {
      const cause = Object.assign(new Error('Invalid credentials'), {
        response: { status: 401 },
      });
      const wrapped = wrapGoogleAuthError(cause, {
        connectionId: 'conn-1',
        provider: 'google',
      });
      expect(wrapped).toBeInstanceOf(ConnectionAuthError);
      expect(wrapped.connectionId).toBe('conn-1');
      expect(wrapped.provider).toBe('google');
      expect((wrapped as Error & { cause?: unknown }).cause).toBe(cause);
    });
  });
});
