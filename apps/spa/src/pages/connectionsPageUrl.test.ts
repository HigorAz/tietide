import { describe, it, expect } from 'vitest';
import { readBridgeFromUrl } from './connectionsPageUrl';

describe('readBridgeFromUrl', () => {
  it('parses a success outcome with the connection id', () => {
    const outcome = readBridgeFromUrl('?status=success&id=conn-123');
    expect(outcome).toEqual({ status: 'success', connectionId: 'conn-123' });
  });

  it('parses an error outcome', () => {
    const outcome = readBridgeFromUrl('?status=error');
    expect(outcome).toEqual({ status: 'error', connectionId: undefined });
  });

  it('returns null for an unrecognised status', () => {
    expect(readBridgeFromUrl('?status=whatever')).toBeNull();
    expect(readBridgeFromUrl('')).toBeNull();
  });

  // W5.44: the `message` URL param is attacker-controllable (anyone can craft
  // /connections?status=error&message=<text>). It must NOT be reflected back —
  // not into the postMessage payload to the opener, nor into a toast. The
  // outcome the page acts on must never carry the raw param.
  it('does not reflect an attacker-supplied message param', () => {
    const outcome = readBridgeFromUrl(
      '?status=error&message=' + encodeURIComponent('Your account was hacked, call 1-800-SCAM'),
    );
    expect(outcome).not.toBeNull();
    expect(outcome as Record<string, unknown>).not.toHaveProperty('message');
    expect(JSON.stringify(outcome)).not.toContain('SCAM');
  });
});
