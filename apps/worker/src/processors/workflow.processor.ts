import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(WorkflowProcessor.name);

  constructor(private readonly engine: EngineService) {
    super();
  }

  async process(job: Job<ExecutionPayload>): Promise<void> {
    this.logger.log(`Processing job ${job.id} for execution ${job.data.executionId}`);
    await this.engine.execute(job.data);
    this.logger.log(`Job ${job.id} completed`);
  }
}
