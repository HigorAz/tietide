import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

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

  async process(job: Job<ExecutionPayload>): Promise<void> {
    this.logger.log(`Processing job ${job.id} for execution ${job.data.executionId}`);

    // Engine service will be injected and called here in Sprint S4
    // For now, this is the scaffold that proves the processor structure works
    this.logger.log(`Job ${job.id} completed`);
  }
}
