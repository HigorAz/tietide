import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import type { WorkflowDefinition } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionEventsService } from '../events/execution-events.service';
import { WorkflowRunner } from './workflow-runner';

export interface ExecutePayload {
  executionId: string;
  workflowId: string;
  triggerType: string;
  triggerData?: Record<string, unknown>;
  requestId?: string;
  userId?: string;
  isDryRun?: boolean;
  definitionOverride?: WorkflowDefinition;
  // Set by iterator/subworkflow nodes when they spawn a child execution.
  // Top-level executions started by the API/cron/webhook leave both unset.
  parentExecutionId?: string;
  depth?: number;
  // Set by the top-level BullMQ processor so a retryable failure can be surfaced
  // for a retry. Left unset for in-process child executions (iterator/subworkflow),
  // which are driven by the parent's resume, not by BullMQ retries (W1.8).
  attemptsMade?: number;
  attemptsAllowed?: number;
}

/**
 * Thrown by {@link EngineService.execute} when a top-level execution fails for a
 * retryable reason, so the BullMQ processor surfaces it and BullMQ retries the
 * job. The execution row is left RUNNING until retries are exhausted, at which
 * point the processor marks it FAILED (W1.8).
 */
export class RetryableExecutionError extends Error {
  constructor(
    message: string,
    readonly executionId: string,
  ) {
    super(message);
    this.name = 'RetryableExecutionError';
  }
}

@Injectable()
export class EngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: WorkflowRunner,
    private readonly log: Logger,
    private readonly events: ExecutionEventsService,
  ) {}

  async execute(payload: ExecutePayload): Promise<void> {
    const { executionId, workflowId, triggerData, requestId, definitionOverride } = payload;
    const isDryRun = payload.isDryRun ?? false;
    const parentExecutionId = payload.parentExecutionId;
    const depth = payload.depth ?? 0;

    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { id: true, definition: true },
    });

    if (!workflow) {
      await this.markFailed(executionId, `Workflow "${workflowId}" not found`);
      return;
    }

    await this.prisma.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    try {
      const definition =
        definitionOverride ?? (workflow.definition as unknown as WorkflowDefinition);
      const result = await this.runner.run({
        executionId,
        workflowId,
        definition,
        triggerData,
        isDryRun,
        parentExecutionId,
        depth,
        requestId,
      });

      const finishedAt = new Date();
      if (result.status === 'SUCCESS') {
        await this.prisma.workflowExecution.update({
          where: { id: executionId },
          data: { status: 'SUCCESS', finishedAt },
        });
        await this.events.publishExecutionCompleted({
          executionId,
          finishedAt,
          status: 'SUCCESS',
        });
      } else {
        const error = result.error ?? 'Unknown failure';
        // A top-level (BullMQ-managed) job whose failure is retryable is surfaced
        // so BullMQ retries it; the row is left RUNNING and the processor records
        // the terminal FAILED state only once retries are exhausted. Dry runs and
        // in-process child executions (no attemptsAllowed) keep the original
        // mark-FAILED-and-return path (W1.8).
        const canRetry = payload.attemptsAllowed !== undefined;
        if (result.retryable && canRetry && !isDryRun) {
          this.log.warn(
            { executionId, workflowId, requestId, err: error },
            `Execution failed (retryable); surfacing for retry: ${error}`,
          );
          throw new RetryableExecutionError(error, executionId);
        }
        await this.prisma.workflowExecution.update({
          where: { id: executionId },
          data: { status: 'FAILED', error, finishedAt },
        });
        await this.events.publishExecutionCompleted({
          executionId,
          finishedAt,
          status: 'FAILED',
          error: { message: error },
        });
      }
    } catch (err) {
      // A surfaced retryable failure must propagate untouched so BullMQ retries it.
      if (err instanceof RetryableExecutionError) {
        throw err;
      }
      const message = (err as Error).message ?? 'Unknown error';
      this.log.error(
        { executionId, workflowId, requestId, err: message },
        `Runner crashed: ${message}`,
      );
      // An unexpected crash is usually transient infra (a DB blip). On a top-level
      // job, surface it for a retry rather than burying it as a terminal failure.
      if (payload.attemptsAllowed !== undefined && !isDryRun) {
        throw new RetryableExecutionError(message, executionId);
      }
      await this.markFailed(executionId, message);
    }
  }

  /**
   * Record the terminal FAILED state for an execution and publish the completed
   * event. Called by the processor once BullMQ has exhausted all retries — until
   * then a retryable failure leaves the row RUNNING so the retry can resume it (W1.8).
   */
  async failExecution(executionId: string, error: string): Promise<void> {
    await this.markFailed(executionId, error);
  }

  private async markFailed(executionId: string, error: string): Promise<void> {
    const finishedAt = new Date();
    await this.prisma.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'FAILED', error, finishedAt },
    });
    await this.events.publishExecutionCompleted({
      executionId,
      finishedAt,
      status: 'FAILED',
      error: { message: error },
    });
  }
}
