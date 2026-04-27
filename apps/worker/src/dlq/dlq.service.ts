import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Logger } from 'nestjs-pino';
import { DLQ_JOB_NAME, DLQ_QUEUE_NAME } from './dlq.constants';

export interface FailedJobPayload {
  executionId: string;
  workflowId: string;
  triggerType: string;
  triggerData?: Record<string, unknown>;
  requestId?: string;
  userId?: string;
}

export interface FailedJobSummary {
  jobId: string;
  attemptsMade: number;
  attemptsAllowed: number;
  failedAt: Date;
  error: string;
  payload: FailedJobPayload;
}

export interface DlqRecord extends FailedJobSummary {
  enqueuedAt: string;
}

@Injectable()
export class DlqService {
  constructor(
    @InjectQueue(DLQ_QUEUE_NAME) private readonly dlq: Queue,
    private readonly logger: Logger,
  ) {}

  async publishFailed(summary: FailedJobSummary): Promise<void> {
    const exhausted = summary.attemptsMade >= summary.attemptsAllowed;
    const ctx = {
      jobId: summary.jobId,
      executionId: summary.payload.executionId,
      workflowId: summary.payload.workflowId,
      attemptsMade: summary.attemptsMade,
      attemptsAllowed: summary.attemptsAllowed,
      err: summary.error,
    };

    if (!exhausted) {
      this.logger.warn(ctx, 'Job failed; will retry');
      return;
    }

    const record: DlqRecord = { ...summary, enqueuedAt: new Date().toISOString() };
    await this.dlq.add(DLQ_JOB_NAME, record, {
      removeOnComplete: false,
      removeOnFail: false,
    });
    this.logger.error(ctx, 'Job exhausted retries; moved to DLQ');
  }
}
