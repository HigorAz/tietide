import { createHash, randomBytes } from 'node:crypto';

/** PKCE challenge method — S256 (the only one we issue; "plain" is insecure). */
export const PKCE_METHOD = 'S256' as const;

export interface PkcePair {
  /** High-entropy secret kept server-side and sent on the token exchange. */
  verifier: string;
  /** base64url(SHA-256(verifier)) — sent on the authorization request. */
  challenge: string;
}

/**
 * Generate a PKCE verifier/challenge pair (RFC 7636).
 *
 * 32 random bytes base64url-encode to 43 chars — within the required 43-128
 * range. The challenge is the base64url SHA-256 of the verifier.
 */
export function generatePkcePair(): PkcePair {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}
