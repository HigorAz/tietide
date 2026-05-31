import { createHash } from 'node:crypto';
import { generatePkcePair, PKCE_METHOD } from './pkce';

describe('generatePkcePair', () => {
  it('uses the S256 method', () => {
    expect(PKCE_METHOD).toBe('S256');
  });

  it('produces a verifier within the RFC 7636 length bounds (43-128 chars)', () => {
    const { verifier } = generatePkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it('produces a url-safe verifier and challenge (base64url alphabet only)', () => {
    const { verifier, challenge } = generatePkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('derives the challenge as base64url(SHA-256(verifier))', () => {
    const { verifier, challenge } = generatePkcePair();
    const expected = createHash('sha256').update(verifier).digest('base64url');
    expect(challenge).toBe(expected);
  });

  it('is random — two calls yield different verifiers', () => {
    expect(generatePkcePair().verifier).not.toBe(generatePkcePair().verifier);
  });
});
