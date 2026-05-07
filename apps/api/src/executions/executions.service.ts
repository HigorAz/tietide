import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { EXECUTION_JOB_NAME, EXECUTION_QUEUE_NAME } from './execution-queue.constants';
import type { ExecutionResponseDto } from './dto/execution-response.dto';
import type {
  ExecutionDetailResponseDto,
  ExecutionListResponseDto,
} from './dto/execution-detail-response.dto';
import type { ExecutionStepResponseDto } from './dto/execution-step-response.dto';
import { sanitizePayload, type WorkflowDefinition } from '@tietide/shared';
import { decodeCursor, encodeCursor } from './cursor';

export interface TriggerOptions {
  triggerData?: Record<string, unknown>;
  idempotencyKey?: string;
  requestId?: string;
}

export interface TestTriggerOptions {
  definition: WorkflowDefinition;
  triggerData?: Record<string, unknown>;
  requestId?: string;
}

export interface ListOptions {
  status?: string;
  workflowId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
  cursor?: string;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

export interface WorkflowExecutionJobPayload {
  executionId: string;
  workflowId: string;
  triggerType: string;
  triggerData?: Record<string, unknown>;
  userId: string;
  requestId?: string;
  isDryRun?: boolean;
  definitionOverride?: WorkflowDefinition;
}

const MAX_ATTEMPTS = 3;
const BACKOFF_DELAY_MS = 1000;

@Injectable()
export class ExecutionsService {
  private readonly log = new Logger(ExecutionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(EXECUTION_QUEUE_NAME) private readonly queue: Queue,
    private readonly audit: AuditLogService,
  ) {}

  async triggerManual(
    userId: string,
    workflowId: string,
    options: TriggerOptions,
  ): Promise<ExecutionResponseDto> {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { id: true, userId: true },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }
    if (workflow.userId !== userId) {
      throw new ForbiddenException('You do not have access to this workflow');
    }

    if (options.idempotencyKey) {
      const existing = await this.prisma.workflowExecution.findFirst({
        where: { workflowId, idempotencyKey: options.idempotencyKey },
      });
      if (existing) {
        this.log.log(
          { workflowId, idempotencyKey: options.idempotencyKey, executionId: existing.id },
          'Returning existing execution for repeated idempotency key',
        );
        return this.toResponse(existing);
      }
    }

    const triggerDataJson =
      options.triggerData !== undefined
        ? (options.triggerData as Prisma.InputJsonValue)
        : undefined;

    const created = await this.prisma.workflowExecution.create({
      data: {
        workflowId,
        status: 'PENDING',
        triggerType: 'manual',
        triggerData: triggerDataJson,
        idempotencyKey: options.idempotencyKey ?? null,
      },
    });

    const payload: WorkflowExecutionJobPayload = {
      executionId: created.id,
      workflowId,
      triggerType: 'manual',
      triggerData: options.triggerData,
      userId,
      requestId: options.requestId,
    };

    await this.queue.add(EXECUTION_JOB_NAME, payload, {
      jobId: created.id,
      attempts: MAX_ATTEMPTS,
      backoff: { type: 'exponential', delay: BACKOFF_DELAY_MS },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 24 * 3600 },
    });

    await this.audit.log({
      userId,
      action: 'execution.trigger',
      resource: 'workflow',
      resourceId: workflowId,
      metadata: { executionId: created.id, triggerType: 'manual' },
    });

    return this.toResponse(created);
  }

  async triggerTest(
    userId: string,
    workflowId: string,
    options: TestTriggerOptions,
  ): Promise<ExecutionResponseDto> {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { id: true, userId: true },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }
    if (workflow.userId !== userId) {
      throw new ForbiddenException('You do not have access to this workflow');
    }

    const triggerDataJson =
      options.triggerData !== undefined
        ? (options.triggerData as Prisma.InputJsonValue)
        : undefined;

    const created = await this.prisma.workflowExecution.create({
      data: {
        workflowId,
        status: 'PENDING',
        triggerType: 'test',
        triggerData: triggerDataJson,
        idempotencyKey: null,
        isDryRun: true,
      },
    });

    const payload: WorkflowExecutionJobPayload = {
      executionId: created.id,
      workflowId,
      triggerType: 'test',
      triggerData: options.triggerData,
      userId,
      requestId: options.requestId,
      isDryRun: true,
      definitionOverride: options.definition,
    };

    await this.queue.add(EXECUTION_JOB_NAME, payload, {
      jobId: created.id,
      attempts: MAX_ATTEMPTS,
      backoff: { type: 'exponential', delay: BACKOFF_DELAY_MS },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 24 * 3600 },
    });

    await this.audit.log({
      userId,
      action: 'execution.test',
      resource: 'workflow',
      resourceId: workflowId,
      metadata: { executionId: created.id, triggerType: 'test' },
    });

    return this.toResponse(created);
  }

  async list(
    userId: string,
    workflowId: string,
    options: ListOptions,
  ): Promise<ExecutionListResponseDto> {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { userId: true },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }
    if (workflow.userId !== userId) {
      throw new ForbiddenException('You do not have access to this workflow');
    }

    const where: Prisma.WorkflowExecutionWhereInput = { workflowId };
    if (options.status) {
      where.status = options.status as Prisma.WorkflowExecutionWhereInput['status'];
    }
    if (options.from || options.to) {
      where.createdAt = {
        ...(options.from ? { gte: options.from } : {}),
        ...(options.to ? { lte: options.to } : {}),
      };
    }

    const page = options.page ?? DEFAULT_PAGE;
    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;

    const [rows, total] = await Promise.all([
      this.prisma.workflowExecution.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.workflowExecution.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toDetailResponse(row)),
      total,
      page,
      pageSize,
      nextCursor: null,
    };
  }

  async listAllForUser(userId: string, options: ListOptions): Promise<ExecutionListResponseDto> {
    const baseWhere: Prisma.WorkflowExecutionWhereInput = { workflow: { userId } };
    if (options.status) {
      baseWhere.status = options.status as Prisma.WorkflowExecutionWhereInput['status'];
    }
    if (options.workflowId) {
      baseWhere.workflowId = options.workflowId;
    }
    if (options.from || options.to) {
      baseWhere.createdAt = {
        ...(options.from ? { gte: options.from } : {}),
        ...(options.to ? { lte: options.to } : {}),
      };
    }

    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;

    if (options.cursor) {
      const cursor = decodeCursor(options.cursor);
      const rowWhere: Prisma.WorkflowExecutionWhereInput = {
        AND: [
          baseWhere,
          {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { AND: [{ createdAt: cursor.createdAt }, { id: { lt: cursor.id } }] },
            ],
          },
        ],
      };

      const [peeked, total] = await Promise.all([
        this.prisma.workflowExecution.findMany({
          where: rowWhere,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: pageSize + 1,
        }),
        this.prisma.workflowExecution.count({ where: baseWhere }),
      ]);

      const hasMore = peeked.length > pageSize;
      const rows = hasMore ? peeked.slice(0, pageSize) : peeked;
      const last = rows[rows.length - 1];
      const nextCursor =
        hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null;

      return {
        items: rows.map((row) => this.toDetailResponse(row)),
        total,
        page: options.page ?? DEFAULT_PAGE,
        pageSize,
        nextCursor,
      };
    }

    const page = options.page ?? DEFAULT_PAGE;
    const skip = (page - 1) * pageSize;

    const [rows, total] = await Promise.all([
      this.prisma.workflowExecution.findMany({
        where: baseWhere,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.workflowExecution.count({ where: baseWhere }),
    ]);

    const last = rows[rows.length - 1];
    const hasMore = skip + rows.length < total;
    const nextCursor =
      hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null;

    return {
      items: rows.map((row) => this.toDetailResponse(row)),
      total,
      page,
      pageSize,
      nextCursor,
    };
  }

  async findOne(userId: string, executionId: string): Promise<ExecutionDetailResponseDto> {
    const row = await this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
      include: { workflow: { select: { userId: true } } },
    });
    if (!row) {
      throw new NotFoundException('Execution not found');
    }
    if (row.workflow.userId !== userId) {
      throw new ForbiddenException('You do not have access to this execution');
    }
    return this.toDetailResponse(row);
  }

  async listSteps(userId: string, executionId: string): Promise<ExecutionStepResponseDto[]> {
    const row = await this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
      include: { workflow: { select: { userId: true } } },
    });
    if (!row) {
      throw new NotFoundException('Execution not found');
    }
    if (row.workflow.userId !== userId) {
      throw new ForbiddenException('You do not have access to this execution');
    }
    const steps = await this.prisma.executionStep.findMany({
      where: { executionId },
      orderBy: { startedAt: 'asc' },
    });
    return steps.map((s) => this.toStepResponse(s));
  }

  private toResponse(row: {
    id: string;
    workflowId: string;
    status: string;
    triggerType: string;
    triggerData: unknown;
    idempotencyKey: string | null;
    isDryRun?: boolean;
    createdAt: Date;
  }): ExecutionResponseDto {
    return {
      id: row.id,
      workflowId: row.workflowId,
      status: row.status,
      triggerType: row.triggerType,
      triggerData: (row.triggerData as Record<string, unknown> | null) ?? null,
      idempotencyKey: row.idempotencyKey,
      isDryRun: row.isDryRun ?? false,
      createdAt: row.createdAt,
    };
  }

  private toDetailResponse(row: {
    id: string;
    workflowId: string;
    status: string;
    triggerType: string;
    triggerData: unknown;
    idempotencyKey: string | null;
    isDryRun?: boolean;
    startedAt?: Date | null;
    finishedAt?: Date | null;
    error?: string | null;
    createdAt: Date;
  }): ExecutionDetailResponseDto {
    return {
      id: row.id,
      workflowId: row.workflowId,
      status: row.status,
      triggerType: row.triggerType,
      triggerData: sanitizePayload(row.triggerData) as Record<string, unknown> | null,
      idempotencyKey: row.idempotencyKey,
      isDryRun: row.isDryRun ?? false,
      startedAt: row.startedAt ?? null,
      finishedAt: row.finishedAt ?? null,
      error: row.error ?? null,
      createdAt: row.createdAt,
    };
  }

  private toStepResponse(row: {
    id: string;
    executionId: string;
    nodeId: string;
    nodeType: string;
    nodeName: string;
    status: string;
    inputData: unknown;
    outputData: unknown;
    error: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    durationMs: number | null;
  }): ExecutionStepResponseDto {
    return {
      id: row.id,
      executionId: row.executionId,
      nodeId: row.nodeId,
      nodeType: row.nodeType,
      nodeName: row.nodeName,
      status: row.status,
      inputData: sanitizePayload(row.inputData) as Record<string, unknown> | null,
      outputData: sanitizePayload(row.outputData) as Record<string, unknown> | null,
      error: row.error,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      durationMs: row.durationMs,
    };
  }
}
