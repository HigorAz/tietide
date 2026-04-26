import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from 'nestjs-pino';
import type { Job } from 'bullmq';
import { EngineService } from '../engine/engine.service';

export interface ExecutionPayload {
  executionId: string;
  workflowId: string;
  triggerType: string;
  triggerData?: Record<string, unknown>;
  requestId?: string;
  userId?: string;
}

@Processor('workflow-execution')
export class WorkflowProcessor extends WorkerHost {
  constructor(
    private readonly engine: EngineService,
    private readonly logger: Logger,
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
      this.logger.log(
        { ...ctx, status: 'completed', durationMs: Date.now() - start },
        'Workflow execution completed',
      );
    } catch (err) {
      this.logger.error(
        { ...ctx, status: 'failed', durationMs: Date.now() - start, err: (err as Error).message },
        'Workflow execution failed',
      );
      throw err;
    }
  }
}
