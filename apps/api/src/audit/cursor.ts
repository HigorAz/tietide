import { BadRequestException } from '@nestjs/common';

export interface AuditCursor {
  createdAt: string;
  id: string;
}

const MAX_CURSOR_LENGTH = 256;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeAuditCursor(cursor: AuditCursor): string {
  const json = JSON.stringify({ createdAt: cursor.createdAt, id: cursor.id });
  return Buffer.from(json, 'utf8').toString('base64url');
}

export function decodeAuditCursor(raw: string): AuditCursor {
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
    typeof (payload as { id?: unknown }).id !== 'string'
  ) {
    throw new BadRequestException('Invalid cursor');
  }

  const createdAt = (payload as { createdAt: string }).createdAt;
  const id = (payload as { id: string }).id;

  const ts = Date.parse(createdAt);
  if (Number.isNaN(ts)) {
    throw new BadRequestException('Invalid cursor');
  }
  if (!UUID_RE.test(id)) {
    throw new BadRequestException('Invalid cursor');
  }

  return { createdAt, id };
}
