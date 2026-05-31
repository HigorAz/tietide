import { BadRequestException } from '@nestjs/common';

/**
 * Opaque keyset-pagination cursor. `v` is the value of a row's primary sort
 * column (an ISO string for dates), `id` is the row id used as a stable
 * tie-breaker so the `(v, id)` pair is a total order. Generic across resources
 * that sort by different columns (createdAt / name / key).
 */
export interface KeysetCursor {
  v: string | number;
  id: string;
}

const MAX_CURSOR_LENGTH = 512;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

export function encodeKeysetCursor(cursor: KeysetCursor): string {
  const json = JSON.stringify({ v: cursor.v, id: cursor.id });
  return Buffer.from(json, 'utf8').toString('base64url');
}

export function decodeKeysetCursor(raw: string): KeysetCursor {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_CURSOR_LENGTH) {
    throw new BadRequestException('Invalid cursor');
  }
  if (!BASE64URL_RE.test(raw)) {
    throw new BadRequestException('Invalid cursor');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Invalid cursor');
  }

  if (!payload || typeof payload !== 'object') {
    throw new BadRequestException('Invalid cursor');
  }
  const v = (payload as { v?: unknown }).v;
  const id = (payload as { id?: unknown }).id;
  if (
    (typeof v !== 'string' && typeof v !== 'number') ||
    typeof id !== 'string' ||
    id.length === 0
  ) {
    throw new BadRequestException('Invalid cursor');
  }

  return { v, id };
}
