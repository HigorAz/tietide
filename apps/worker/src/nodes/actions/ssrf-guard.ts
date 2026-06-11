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
 * Note: a determined attacker could still attempt DNS rebinding (resolve to a
 * public IP here, then to a private one at connect time). Fully closing that
 * requires pinning the validated IP into the socket connect; tracked as a
 * follow-up. This guard closes the direct/by-name SSRF vectors.
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
 * Validate a user-supplied URL for outbound fetch. Returns the parsed URL when
 * allowed; throws SsrfBlockedError otherwise. Pass `lookupFn` in tests.
 */
export async function assertUrlAllowed(
  rawUrl: string,
  lookupFn: LookupFn = defaultLookup,
): Promise<URL> {
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

  // Literal IP host — check directly, no DNS.
  if (isIP(host) !== 0) {
    if (isBlockedAddress(host)) {
      throw new SsrfBlockedError('Refusing to connect to a private or internal address');
    }
    return url;
  }

  // Common hostnames that resolve to loopback regardless of DNS.
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new SsrfBlockedError('Refusing to connect to localhost');
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookupFn(host);
  } catch {
    throw new SsrfBlockedError(`Could not resolve host "${host}"`);
  }
  if (addresses.length === 0) {
    throw new SsrfBlockedError(`Host "${host}" did not resolve to any address`);
  }
  for (const { address } of addresses) {
    if (isBlockedAddress(address)) {
      throw new SsrfBlockedError('Refusing to connect to a private or internal address');
    }
  }
  return url;
}
