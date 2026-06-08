import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Logger } from 'nestjs-pino';
import { OAUTH_REFRESH_DLQ_JOB, OAUTH_REFRESH_DLQ_QUEUE } from './oauth-refresh.constants';

export interface OAuthRefreshFailedPayload {
  connectionId: string;
  provider: string;
  organizationId?: string;
}

export interface OAuthRefreshFailedSummary {
  jobId: string;
  attemptsMade: number;
  attemptsAllowed: number;
  failedAt: Date;
  error: string;
  payload: OAuthRefreshFailedPayload;
  failureCount: number;
}

export interface OAuthRefreshDlqRecord extends OAuthRefreshFailedSummary {
  enqueuedAt: string;
}

@Injectable()
export class OAuthRefreshDlqService {
  constructor(
    @InjectQueue(OAUTH_REFRESH_DLQ_QUEUE) private readonly dlq: Queue,
    private readonly logger: Logger,
  ) {}

  async publishFailed(summary: OAuthRefreshFailedSummary): Promise<void> {
    const ctx = {
      jobId: summary.jobId,
      connectionId: summary.payload.connectionId,
      provider: summary.payload.provider,
      attemptsMade: summary.attemptsMade,
      failureCount: summary.failureCount,
      err: summary.error,
    };

    const record: OAuthRefreshDlqRecord = {
      ...summary,
      enqueuedAt: new Date().toISOString(),
    };

    await this.dlq.add(OAUTH_REFRESH_DLQ_JOB, record, {
      removeOnComplete: false,
      removeOnFail: false,
    });
    this.logger.error(ctx, 'OAuth refresh exhausted retries; moved to DLQ');
  }
}
