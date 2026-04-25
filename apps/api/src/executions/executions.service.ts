import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EXECUTION_JOB_NAME, EXECUTION_QUEUE_NAME } from './execution-queue.constants';
import type { ExecutionResponseDto } from './dto/execution-response.dto';

export interface TriggerOptions {
  triggerData?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface WorkflowExecutionJobPayload {
  executionId: string;
  workflowId: string;
  triggerType: string;
  triggerData?: Record<string, unknown>;
  userId: string;
}

const MAX_ATTEMPTS = 3;
const BACKOFF_DELAY_MS = 1000;

@Injectable()
export class ExecutionsService {
  private readonly log = new Logger(ExecutionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(EXECUTION_QUEUE_NAME) private readonly queue: Queue,
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
    };

    await this.queue.add(EXECUTION_JOB_NAME, payload, {
      jobId: created.id,
      attempts: MAX_ATTEMPTS,
      backoff: { type: 'exponential', delay: BACKOFF_DELAY_MS },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 24 * 3600 },
    });

    return this.toResponse(created);
  }

  private toResponse(row: {
    id: string;
    workflowId: string;
    status: string;
    triggerType: string;
    triggerData: unknown;
    idempotencyKey: string | null;
    createdAt: Date;
  }): ExecutionResponseDto {
    return {
      id: row.id,
      workflowId: row.workflowId,
      status: row.status,
      triggerType: row.triggerType,
      triggerData: (row.triggerData as Record<string, unknown> | null) ?? null,
      idempotencyKey: row.idempotencyKey,
      createdAt: row.createdAt,
    };
  }
}
