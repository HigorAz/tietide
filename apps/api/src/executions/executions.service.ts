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
import { buildSingleNodeDefinition } from './single-node-subgraph';

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
  // The actor who triggered the run (creator/auditor) and the workspace the run
  // belongs to. The worker scopes secrets/connections/env-vars by organizationId.
  userId: string;
  organizationId: string;
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
    organizationId: string,
    userId: string,
    workflowId: string,
    options: TriggerOptions,
  ): Promise<ExecutionResponseDto> {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { id: true, organizationId: true },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }
    if (workflow.organizationId !== organizationId) {
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

    let created: Awaited<ReturnType<typeof this.prisma.workflowExecution.create>>;
    try {
      created = await this.prisma.workflowExecution.create({
        data: {
          workflowId,
          status: 'PENDING',
          triggerType: 'manual',
          triggerData: triggerDataJson,
          idempotencyKey: options.idempotencyKey ?? null,
        },
      });
    } catch (err) {
      // The pre-create dedup findFirst above is not atomic with this create: a
      // concurrent trigger carrying the same idempotency key can pass its own
      // findFirst and create first, leaving us to lose the race on the
      // @@unique([workflowId, idempotencyKey]) constraint (P2002). Treat that as
      // a duplicate — return the row the winner created, without enqueuing a
      // second job. (Null keys never collide: NULLs are distinct in the index.)
      if (options.idempotencyKey && this.isUniqueViolation(err)) {
        const winner = await this.prisma.workflowExecution.findFirst({
          where: { workflowId, idempotencyKey: options.idempotencyKey },
        });
        if (winner) {
          this.log.log(
            { workflowId, idempotencyKey: options.idempotencyKey, executionId: winner.id },
            'Concurrent idempotency-key race, returning execution created by the winner',
          );
          return this.toResponse(winner);
        }
      }
      throw err;
    }

    const payload: WorkflowExecutionJobPayload = {
      executionId: created.id,
      workflowId,
      triggerType: 'manual',
      triggerData: options.triggerData,
      userId,
      organizationId,
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
      organizationId,
      action: 'execution.trigger',
      resource: 'workflow',
      resourceId: workflowId,
      metadata: { executionId: created.id, triggerType: 'manual' },
    });

    return this.toResponse(created);
  }

  async triggerTest(
    organizationId: string,
    userId: string,
    workflowId: string,
    options: TestTriggerOptions,
  ): Promise<ExecutionResponseDto> {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { id: true, organizationId: true },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }
    if (workflow.organizationId !== organizationId) {
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
      organizationId,
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
      organizationId,
      action: 'execution.test',
      resource: 'workflow',
      resourceId: workflowId,
      metadata: { executionId: created.id, triggerType: 'test' },
    });

    return this.toResponse(created);
  }

  /**
   * Run a SINGLE node against real connector credentials (not a dry run) and
   * capture its output, for the "Test this node" data-pill capture flow (#259).
   * Builds a minimal subgraph (the node + its ancestors) and enqueues it via the
   * same definition-override path as `triggerTest`, with `isDryRun: false`.
   */
  async triggerNodeTest(
    organizationId: string,
    userId: string,
    workflowId: string,
    nodeId: string,
    options: TestTriggerOptions,
  ): Promise<ExecutionResponseDto> {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { id: true, organizationId: true },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }
    if (workflow.organizationId !== organizationId) {
      throw new ForbiddenException('You do not have access to this workflow');
    }
    if (!options.definition.nodes.some((n) => n.id === nodeId)) {
      throw new NotFoundException('Node not found');
    }

    const subgraph = buildSingleNodeDefinition(options.definition, nodeId);

    const triggerDataJson =
      options.triggerData !== undefined
        ? (options.triggerData as Prisma.InputJsonValue)
        : undefined;

    const created = await this.prisma.workflowExecution.create({
      data: {
        workflowId,
        status: 'PENDING',
        triggerType: 'node-test',
        triggerData: triggerDataJson,
        idempotencyKey: null,
        isDryRun: false,
      },
    });

    const payload: WorkflowExecutionJobPayload = {
      executionId: created.id,
      workflowId,
      triggerType: 'node-test',
      triggerData: options.triggerData,
      userId,
      organizationId,
      requestId: options.requestId,
      isDryRun: false,
      definitionOverride: subgraph,
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
      organizationId,
      action: 'execution.node-test',
      resource: 'workflow',
      resourceId: workflowId,
      metadata: { executionId: created.id, triggerType: 'node-test', nodeId },
    });

    return this.toResponse(created);
  }

  async list(
    organizationId: string,
    workflowId: string,
    options: ListOptions,
  ): Promise<ExecutionListResponseDto> {
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

  async listAllForOrg(
    organizationId: string,
    options: ListOptions,
  ): Promise<ExecutionListResponseDto> {
    const baseWhere: Prisma.WorkflowExecutionWhereInput = { workflow: { organizationId } };
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

  async findOne(organizationId: string, executionId: string): Promise<ExecutionDetailResponseDto> {
    const row = await this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
      include: { workflow: { select: { organizationId: true } } },
    });
    if (!row) {
      throw new NotFoundException('Execution not found');
    }
    if (row.workflow.organizationId !== organizationId) {
      throw new ForbiddenException('You do not have access to this execution');
    }
    return this.toDetailResponse(row);
  }

  async listSteps(
    organizationId: string,
    executionId: string,
  ): Promise<ExecutionStepResponseDto[]> {
    const row = await this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
      include: { workflow: { select: { organizationId: true } } },
    });
    if (!row) {
      throw new NotFoundException('Execution not found');
    }
    if (row.workflow.organizationId !== organizationId) {
      throw new ForbiddenException('You do not have access to this execution');
    }
    const steps = await this.prisma.executionStep.findMany({
      where: { executionId },
      orderBy: { startedAt: 'asc' },
    });
    return steps.map((s) => this.toStepResponse(s));
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: unknown }).code === 'P2002'
    );
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
