import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { decodeAuditCursor, encodeAuditCursor } from './cursor';
import type {
  AuditLogFiltersResponseDto,
  AuditLogListResponseDto,
  AuditLogResponseDto,
} from './dto/audit-log-response.dto';

export interface AuditLogEntry {
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogFilters {
  userId?: string;
  action?: string;
  resource?: string;
  from?: string;
  to?: string;
}

interface FindManyOptions {
  filters: AuditLogFilters;
  cursor?: string;
  limit?: number;
}

interface FindAllForExportOptions {
  filters: AuditLogFilters;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const EXPORT_HARD_CAP = 10_000;
const FILTER_VALUES_CAP = 200;

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

interface AuditRowWithUser {
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  user?: { email: string } | null;
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

  async findMany(options: FindManyOptions): Promise<AuditLogListResponseDto> {
    const limit = this.resolveLimit(options.limit);
    const where = this.buildWhere(options.filters);

    if (options.cursor) {
      const cursor = decodeAuditCursor(options.cursor);
      const cursorDate = new Date(cursor.createdAt);
      where.OR = [
        { createdAt: { lt: cursorDate } },
        { createdAt: cursorDate, id: { lt: cursor.id } },
      ];
    }

    const rows = (await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { user: { select: { email: true } } },
    })) as AuditRowWithUser[];

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? encodeAuditCursor({
            createdAt: page[page.length - 1].createdAt.toISOString(),
            id: page[page.length - 1].id,
          })
        : null;

    return { items: page.map((row) => this.toResponseDto(row)), nextCursor };
  }

  async findAllForExport(options: FindAllForExportOptions): Promise<AuditLogResponseDto[]> {
    const where = this.buildWhere(options.filters);

    const rows = (await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: EXPORT_HARD_CAP,
      include: { user: { select: { email: true } } },
    })) as AuditRowWithUser[];

    return rows.map((row) => this.toResponseDto(row));
  }

  async listFilterValues(): Promise<AuditLogFiltersResponseDto> {
    const [users, actionRows, resourceRows] = await Promise.all([
      this.prisma.user.findMany({
        select: { id: true, email: true },
        orderBy: { email: 'asc' },
        take: FILTER_VALUES_CAP,
      }),
      this.prisma.auditLog.findMany({
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
        take: FILTER_VALUES_CAP,
      }),
      this.prisma.auditLog.findMany({
        distinct: ['resource'],
        select: { resource: true },
        orderBy: { resource: 'asc' },
        take: FILTER_VALUES_CAP,
      }),
    ]);

    return {
      users: users.map((u: { id: string; email: string }) => ({ id: u.id, email: u.email })),
      actions: actionRows.map((r: { action: string }) => r.action),
      resources: resourceRows.map((r: { resource: string }) => r.resource),
    };
  }

  private buildWhere(filters: AuditLogFilters): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.action) where.action = filters.action;
    if (filters.resource) where.resource = filters.resource;

    const fromDate = filters.from ? new Date(filters.from) : undefined;
    const toDate = filters.to ? new Date(filters.to) : undefined;
    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('from must be before or equal to to');
    }
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = fromDate;
      if (toDate) where.createdAt.lte = toDate;
    }
    return where;
  }

  private resolveLimit(value: number | undefined): number {
    if (value === undefined) return DEFAULT_PAGE_SIZE;
    if (!Number.isInteger(value) || value < 1) {
      throw new BadRequestException(`limit must be a positive integer`);
    }
    if (value > MAX_PAGE_SIZE) return MAX_PAGE_SIZE;
    return value;
  }

  private toResponseDto(row: AuditRowWithUser): AuditLogResponseDto {
    return {
      id: row.id,
      userId: row.userId,
      userEmail: row.user?.email ?? null,
      action: row.action,
      resource: row.resource,
      resourceId: row.resourceId ?? null,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      createdAt: row.createdAt,
    };
  }
}
