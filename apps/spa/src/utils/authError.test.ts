import { describe, it, expect } from 'vitest';
import { resolveAuthErrorMessage } from './authError';

describe('resolveAuthErrorMessage', () => {
  it('returns a rate-limit message for HTTP 429', () => {
    expect(resolveAuthErrorMessage({ response: { status: 429 } })).toMatch(/too many attempts/i);
  });

  it('returns a connection message when there is no HTTP response (network failure)', () => {
    expect(resolveAuthErrorMessage({ request: {} })).toMatch(/cannot reach the server/i);
    expect(resolveAuthErrorMessage({ code: 'ERR_NETWORK' })).toMatch(/cannot reach the server/i);
    expect(resolveAuthErrorMessage(new Error('boom'))).toMatch(/cannot reach the server/i);
  });

  it('returns a generic message for other server-side statuses', () => {
    expect(resolveAuthErrorMessage({ response: { status: 500 } })).toMatch(/something went wrong/i);
    expect(resolveAuthErrorMessage({ response: { status: 400 } })).toMatch(/something went wrong/i);
  });
});
