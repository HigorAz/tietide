import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Logger } from 'nestjs-pino';
import { sanitizePayload } from '@tietide/shared';
import { DLQ_JOB_NAME, DLQ_QUEUE_NAME, DLQ_RETENTION_AGE_SECONDS } from './dlq.constants';

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

    // Redact secrets/PII in the raw trigger payload before persisting to the DLQ
    // (data-minimization — DLQ records must not retain bearer tokens or credentials in the clear).
    const safePayload: FailedJobPayload = {
      ...summary.payload,
      triggerData:
        summary.payload.triggerData === undefined
          ? undefined
          : (sanitizePayload(summary.payload.triggerData) as Record<string, unknown>),
    };
    const record: DlqRecord = {
      ...summary,
      payload: safePayload,
      enqueuedAt: new Date().toISOString(),
    };
    // Bound retention so failed jobs do not accumulate sensitive payloads forever.
    await this.dlq.add(DLQ_JOB_NAME, record, {
      removeOnComplete: { age: DLQ_RETENTION_AGE_SECONDS },
      removeOnFail: { age: DLQ_RETENTION_AGE_SECONDS },
    });
    this.logger.error(ctx, 'Job exhausted retries; moved to DLQ');
  }
}
