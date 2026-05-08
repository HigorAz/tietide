import { UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

export const REPLAY_WINDOW_SECONDS = 300;
const HMAC_HEX_LENGTH = 64;

export function assertFreshTimestamp(timestamp: string | undefined): void {
  if (!timestamp) {
    throw new UnauthorizedException('Invalid signature');
  }
  const parsed = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(parsed) || String(parsed) !== timestamp.trim()) {
    throw new UnauthorizedException('Invalid signature');
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - parsed) > REPLAY_WINDOW_SECONDS) {
    throw new UnauthorizedException('Invalid signature');
  }
}

export function assertValidHexHmac(
  secret: string,
  timestamp: string,
  rawBody: Buffer,
  signature: string | undefined,
): void {
  if (!signature || signature.length !== HMAC_HEX_LENGTH) {
    throw new UnauthorizedException('Invalid signature');
  }

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'hex');
  let providedBuf: Buffer;
  try {
    providedBuf = Buffer.from(signature, 'hex');
  } catch {
    throw new UnauthorizedException('Invalid signature');
  }

  if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
    throw new UnauthorizedException('Invalid signature');
  }
}

export function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}
