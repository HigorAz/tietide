import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogEntry {
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

const SENSITIVE_KEYS = new Set([
  'value',
  'password',
  'token',
  'secret',
  'authorization',
  'nonce',
  'apiKey',
  'encryptionKey',
  'hmacSecret',
]);

function sanitizeMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(metadata)) {
    if (SENSITIVE_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      const safeMetadata = sanitizeMetadata(entry.metadata);
      await this.prisma.auditLog.create({
        data: {
          userId: entry.userId,
          action: entry.action,
          resource: entry.resource,
          resourceId: entry.resourceId,
          metadata: safeMetadata as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to write audit log entry action=${entry.action} resource=${entry.resource}: ${(err as Error).message}`,
      );
    }
  }
}
