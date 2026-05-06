import { BadRequestException } from '@nestjs/common';

export interface ExecutionCursor {
  createdAt: Date;
  id: string;
}

const MAX_CURSOR_LENGTH = 256;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

export function encodeCursor(cursor: ExecutionCursor): string {
  const json = JSON.stringify({
    createdAt: cursor.createdAt.toISOString(),
    id: cursor.id,
  });
  return Buffer.from(json, 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): ExecutionCursor {
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
    typeof (payload as { createdAt?: unknown }).createdAt !== 'string' ||
    typeof (payload as { id?: unknown }).id !== 'string' ||
    (payload as { id: string }).id.length === 0
  ) {
    throw new BadRequestException('Invalid cursor');
  }

  const createdAt = new Date((payload as { createdAt: string }).createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    throw new BadRequestException('Invalid cursor');
  }

  return { createdAt, id: (payload as { id: string }).id };
}
