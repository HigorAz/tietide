import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from 'nestjs-pino';
import type { Job } from 'bullmq';
import { DlqService } from '../dlq/dlq.service';
import { MAX_EXECUTION_ATTEMPTS } from '../dlq/dlq.constants';
import { EngineService } from '../engine/engine.service';
import { WorkerMetricsService } from '../metrics/worker-metrics.service';
import { resolveWorkerConcurrency } from './concurrency.config';

export interface ExecutionPayload {
  executionId: string;
  workflowId: string;
  triggerType: string;
  triggerData?: Record<string, unknown>;
  requestId?: string;
  userId?: string;
}

@Processor('workflow-execution', { concurrency: resolveWorkerConcurrency() })
export class WorkflowProcessor extends WorkerHost {
  constructor(
    private readonly engine: EngineService,
    private readonly logger: Logger,
    private readonly dlq: DlqService,
    private readonly metrics: WorkerMetricsService,
  ) {
    super();
  }

  async process(job: Job<ExecutionPayload>): Promise<void> {
    const { executionId, workflowId, triggerType, requestId, userId } = job.data;
    const ctx = { jobId: job.id, executionId, workflowId, triggerType, requestId, userId };

    this.logger.log({ ...ctx, status: 'started' }, 'Workflow execution started');
    const start = Date.now();
    try {
      await this.engine.execute(job.data);
      const durationMs = Date.now() - start;
      this.metrics.observeExecution('completed', durationMs / 1000);
      this.logger.log({ ...ctx, status: 'completed', durationMs }, 'Workflow execution completed');
    } catch (err) {
      const durationMs = Date.now() - start;
      this.metrics.observeExecution('failed', durationMs / 1000);
      this.logger.error(
        { ...ctx, status: 'failed', durationMs, err: (err as Error).message },
        'Workflow execution failed',
      );
      throw err;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<ExecutionPayload> | undefined, error: Error): Promise<void> {
    if (!job) {
      return;
    }
    const attemptsAllowed = job.opts?.attempts ?? MAX_EXECUTION_ATTEMPTS;
    await this.dlq.publishFailed({
      jobId: String(job.id ?? 'unknown'),
      attemptsMade: job.attemptsMade,
      attemptsAllowed,
      failedAt: new Date(),
      error: error?.message ?? 'Unknown error',
      payload: job.data,
    });
  }
}
