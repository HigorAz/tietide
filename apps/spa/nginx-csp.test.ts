import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const nginxConf = readFileSync(join(here, 'nginx.conf'), 'utf8');

/**
 * W5.40 — CSP connect-src must not allow WebSocket to any host.
 *
 * Bare `ws:`/`wss:` scheme sources in connect-src match ANY host, so a
 * compromised script/dependency could open a WebSocket to an attacker server
 * and exfiltrate the localStorage JWT. The legitimate Socket.IO stream is
 * same-origin (baked /v1, served from the SPA origin), so the WebSocket source
 * must be pinned to the API origin rather than a wildcard scheme.
 */
describe('nginx.conf Content-Security-Policy (W5.40)', () => {
  function getConnectSrc(): string {
    const csp = /Content-Security-Policy\s+"([^"]+)"/.exec(nginxConf)?.[1];
    expect(csp, 'Content-Security-Policy header must be present').toBeTruthy();
    const directive = csp!
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith('connect-src'));
    expect(directive, 'connect-src directive must be present').toBeTruthy();
    return directive!;
  }

  it('does not allow WebSocket connections to any host via bare ws:/wss: schemes', () => {
    const connectSrc = getConnectSrc();
    const sources = connectSrc.split(/\s+/).slice(1); // drop the "connect-src" token
    expect(sources).not.toContain('ws:');
    expect(sources).not.toContain('wss:');
  });

  it('still permits same-origin connections', () => {
    const connectSrc = getConnectSrc();
    expect(connectSrc.split(/\s+/)).toContain("'self'");
  });

  it('pins the WebSocket source to a secure, host-scoped wss:// origin when present', () => {
    const connectSrc = getConnectSrc();
    const wsSources = connectSrc
      .split(/\s+/)
      .filter(
        (s) => s.startsWith('ws://') || s.startsWith('wss://') || s === 'ws:' || s === 'wss:',
      );
    // Any websocket source declared must be a host-scoped wss:// origin, never a bare scheme or plaintext ws://.
    for (const src of wsSources) {
      expect(src).toMatch(/^wss:\/\/[^\s/]+$/);
    }
  });
});
