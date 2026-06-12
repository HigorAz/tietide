import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * SSRF protection for the generic HTTP Request node. A workflow URL is fully
 * user-controlled (and may be spliced from trigger data), so without this guard
 * a workflow could make the worker reach internal services (postgres, valkey,
 * the AI service), localhost admin endpoints, or the cloud metadata endpoint
 * (169.254.169.254) to steal credentials.
 *
 * Strategy: allow only http/https, then resolve the host and reject if ANY
 * resolved address falls in a loopback / link-local / private / unique-local /
 * carrier-grade-NAT range. Literal-IP hosts are checked directly.
 *
 * DNS rebinding (validate-vs-connect TOCTOU) is closed by the caller: this guard
 * surfaces the exact set of addresses it validated (`assertUrlAllowedWithAddresses`)
 * so the HTTP node can pin the socket connect to those addresses via a custom
 * undici dispatcher, instead of letting fetch re-resolve the hostname at connect
 * time (where an attacker's TTL-0 record could swap in a private IP). See W5.6.
 */

export type LookupFn = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const defaultLookup: LookupFn = (hostname) =>
  lookup(hostname, { all: true }) as Promise<Array<{ address: string; family: number }>>;

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value >>> 0;
}

function inV4Cidr(ipInt: number, base: string, maskBits: number): boolean {
  const baseInt = ipv4ToInt(base);
  if (baseInt === null) return false;
  const mask = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

// Loopback, private, link-local (incl. cloud metadata 169.254.169.254),
// CGNAT, "this-host", and benchmarking ranges.
const BLOCKED_V4_CIDRS: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
];

function isBlockedV4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) return false;
  return BLOCKED_V4_CIDRS.some(([base, bits]) => inV4Cidr(ipInt, base, bits));
}

function hexGroupsToV4(g1: string, g2: string): string {
  const hi = parseInt(g1, 16);
  const lo = parseInt(g2, 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

function isBlockedV6(ipRaw: string): boolean {
  const ip = ipRaw.toLowerCase().replace(/^\[|\]$/g, '');
  // IPv4-mapped (::ffff:a.b.c.d) — classify by the embedded v4 address.
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedV4(mapped[1]);
  // IPv4-mapped in hex form — the WHATWG URL parser normalizes
  // ::ffff:127.0.0.1 to ::ffff:7f00:1. Reconstruct the embedded v4 address.
  const mappedHex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) return isBlockedV4(hexGroupsToV4(mappedHex[1], mappedHex[2]));
  // NAT64 (64:ff9b::/96) embeds an IPv4 address in the low 32 bits.
  const nat64 = ip.match(/^64:ff9b::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (nat64) return isBlockedV4(hexGroupsToV4(nat64[1], nat64[2]));
  if (ip === '::1' || ip === '::') return true; // loopback / unspecified
  if (ip.startsWith('fe80') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb'))
    return true; // fe80::/10 link-local
  // fc00::/7 unique-local (fc.. and fd..) — includes AWS IPv6 metadata fd00:ec2::254
  if (/^f[cd]/.test(ip)) return true;
  return false;
}

export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isBlockedV4(ip);
  if (family === 6) return isBlockedV6(ip);
  return false;
}

/**
 * Result of a successful SSRF validation: the parsed URL plus the exact set of
 * IP addresses that were validated. `addresses` is what the caller MUST pin the
 * socket to (via an undici dispatcher) so the connect-time DNS lookup cannot be
 * rebound to a private IP. For a literal-IP host it contains just that IP; for a
 * hostname it contains every address the resolver returned (all already proven
 * public). `isLiteralIp` lets the caller skip pinning when there is no DNS to
 * rebind.
 */
export interface AllowedUrl {
  url: URL;
  addresses: string[];
  isLiteralIp: boolean;
}

/**
 * Validate a user-supplied URL for outbound fetch and surface the validated
 * addresses so the caller can pin them into the socket connect (closing the
 * DNS-rebinding TOCTOU — W5.6). Throws SsrfBlockedError when disallowed. Pass
 * `lookupFn` in tests.
 */
export async function assertUrlAllowedWithAddresses(
  rawUrl: string,
  lookupFn: LookupFn = defaultLookup,
): Promise<AllowedUrl> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError('Invalid URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfBlockedError(
      `Unsupported URL scheme "${url.protocol}" (only http/https allowed)`,
    );
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');

  // Literal IP host — check directly, no DNS. Pin to the literal itself.
  if (isIP(host) !== 0) {
    if (isBlockedAddress(host)) {
      throw new SsrfBlockedError('Refusing to connect to a private or internal address');
    }
    return { url, addresses: [host], isLiteralIp: true };
  }

  // Common hostnames that resolve to loopback regardless of DNS.
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new SsrfBlockedError('Refusing to connect to localhost');
  }

  let resolved: Array<{ address: string }>;
  try {
    resolved = await lookupFn(host);
  } catch {
    throw new SsrfBlockedError(`Could not resolve host "${host}"`);
  }
  if (resolved.length === 0) {
    throw new SsrfBlockedError(`Host "${host}" did not resolve to any address`);
  }
  for (const { address } of resolved) {
    if (isBlockedAddress(address)) {
      throw new SsrfBlockedError('Refusing to connect to a private or internal address');
    }
  }
  return { url, addresses: resolved.map((r) => r.address), isLiteralIp: false };
}

/**
 * Backwards-compatible wrapper: validate a user-supplied URL and return only the
 * parsed URL. Prefer `assertUrlAllowedWithAddresses` when you need to pin the
 * connect address.
 */
export async function assertUrlAllowed(
  rawUrl: string,
  lookupFn: LookupFn = defaultLookup,
): Promise<URL> {
  const { url } = await assertUrlAllowedWithAddresses(rawUrl, lookupFn);
  return url;
}
