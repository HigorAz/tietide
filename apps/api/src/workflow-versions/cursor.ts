import { BadRequestException } from '@nestjs/common';

export interface VersionCursor {
  version: number;
}

const MAX_CURSOR_LENGTH = 256;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

export function encodeVersionCursor(cursor: VersionCursor): string {
  const json = JSON.stringify({ version: cursor.version });
  return Buffer.from(json, 'utf8').toString('base64url');
}

export function decodeVersionCursor(raw: string): VersionCursor {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_CURSOR_LENGTH) {
    throw new BadRequestException('Invalid cursor');
  }
  if (!BASE64URL_RE.test(raw)) {
    throw new BadRequestException('Invalid cursor');
  }

  let payload: unknown;
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    payload = JSON.parse(json);
  } catch {
    throw new BadRequestException('Invalid cursor');
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof (payload as { version?: unknown }).version !== 'number' ||
    !Number.isInteger((payload as { version: number }).version) ||
    (payload as { version: number }).version <= 0
  ) {
    throw new BadRequestException('Invalid cursor');
  }

  return { version: (payload as { version: number }).version };
}
