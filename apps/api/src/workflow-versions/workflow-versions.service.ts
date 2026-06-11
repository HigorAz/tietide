import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { decodeVersionCursor, encodeVersionCursor } from './cursor';
import type {
  WorkflowVersionListResponseDto,
  WorkflowVersionResponseDto,
  WorkflowVersionRestoreResponseDto,
  WorkflowVersionSummaryDto,
} from './dto/version-response.dto';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

interface ListOptions {
  cursor?: string;
  limit?: number;
}

@Injectable()
export class WorkflowVersionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async list(
    organizationId: string,
    workflowId: string,
    options: ListOptions,
  ): Promise<WorkflowVersionListResponseDto> {
    await this.assertWorkflowAccess(organizationId, workflowId);

    const limit = this.resolveLimit(options.limit);
    const cursor = options.cursor ? decodeVersionCursor(options.cursor) : null;

    const where: { workflowId: string; version?: { lt: number } } = { workflowId };
    if (cursor) {
      where.version = { lt: cursor.version };
    }

    const rows = await this.prisma.workflowVersion.findMany({
      where,
      orderBy: [{ version: 'desc' }],
      take: limit + 1,
      include: { createdBy: { select: { id: true, email: true } } },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? encodeVersionCursor({ version: page[page.length - 1].version })
        : null;

    const items: WorkflowVersionSummaryDto[] = page.map((row) => ({
      id: row.id,
      version: row.version,
      message: row.message,
      createdAt: row.createdAt,
      createdBy: row.createdBy ? { id: row.createdBy.id, email: row.createdBy.email } : null,
    }));

    return { items, nextCursor };
  }

  async getOne(
    organizationId: string,
    workflowId: string,
    version: number,
  ): Promise<WorkflowVersionResponseDto> {
    await this.assertWorkflowAccess(organizationId, workflowId);

    const row = await this.prisma.workflowVersion.findUnique({
      where: { workflowId_version: { workflowId, version } },
      include: { createdBy: { select: { id: true, email: true } } },
    });

    if (!row) {
      throw new NotFoundException('Version not found');
    }

    return {
      id: row.id,
      workflowId: row.workflowId,
      version: row.version,
      definition: row.definition as Record<string, unknown>,
      message: row.message,
      createdAt: row.createdAt,
      createdBy: row.createdBy ? { id: row.createdBy.id, email: row.createdBy.email } : null,
    };
  }

  async restore(
    organizationId: string,
    userId: string,
    workflowId: string,
    version: number,
  ): Promise<WorkflowVersionRestoreResponseDto> {
    await this.assertWorkflowAccess(organizationId, workflowId);

    const row = await this.prisma.workflowVersion.findUnique({
      where: { workflowId_version: { workflowId, version } },
      select: { version: true, definition: true },
    });

    if (!row) {
      throw new NotFoundException('Version not found');
    }

    await this.audit.log({
      userId,
      action: 'workflow.version.restore',
      resource: 'workflow',
      resourceId: workflowId,
      metadata: { version: row.version },
    });

    return {
      version: row.version,
      definition: row.definition as Record<string, unknown>,
    };
  }

  private async assertWorkflowAccess(organizationId: string, workflowId: string): Promise<void> {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { organizationId: true },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }
    if (workflow.organizationId !== organizationId) {
      throw new ForbiddenException('You do not have access to this workflow');
    }
  }

  private resolveLimit(value: number | undefined): number {
    if (value === undefined) {
      return DEFAULT_PAGE_SIZE;
    }
    if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
      throw new BadRequestException(`limit must be between 1 and ${MAX_PAGE_SIZE}`);
    }
    return value;
  }
}
