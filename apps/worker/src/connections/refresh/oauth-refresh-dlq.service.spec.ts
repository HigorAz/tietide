import type { Queue } from 'bullmq';
import type { Logger } from 'nestjs-pino';
import {
  OAuthRefreshDlqService,
  type OAuthRefreshFailedSummary,
} from './oauth-refresh-dlq.service';
import { OAUTH_REFRESH_DLQ_JOB } from './oauth-refresh.constants';

const makeQueue = () =>
  ({
    add: jest.fn().mockResolvedValue(undefined),
  }) as unknown as jest.Mocked<Queue>;

const makeLogger = () =>
  ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }) as unknown as jest.Mocked<Logger>;

const makeSummary = (
  overrides: Partial<OAuthRefreshFailedSummary> = {},
): OAuthRefreshFailedSummary => ({
  jobId: 'job-123',
  attemptsMade: 3,
  attemptsAllowed: 3,
  failedAt: new Date('2026-05-11T12:00:00.000Z'),
  error: 'invalid_grant: refresh token revoked',
  payload: { connectionId: 'conn-1', provider: 'google', organizationId: 'org-1' },
  failureCount: 3,
  ...overrides,
});

describe('OAuthRefreshDlqService', () => {
  describe('publishFailed', () => {
    it('should enqueue the DLQ job with refresh-dlq name and a persisted record', async () => {
      const queue = makeQueue();
      const logger = makeLogger();
      const service = new OAuthRefreshDlqService(queue, logger);
      const summary = makeSummary();

      await service.publishFailed(summary);

      expect(queue.add).toHaveBeenCalledTimes(1);
      const [jobName, payload, opts] = (queue.add as jest.Mock).mock.calls[0];
      expect(jobName).toBe(OAUTH_REFRESH_DLQ_JOB);
      // The original failure metadata must be preserved verbatim — operators
      // inspect this queue to triage stuck OAuth connections (CLAUDE.md §7).
      expect(payload).toMatchObject({
        jobId: summary.jobId,
        attemptsMade: summary.attemptsMade,
        attemptsAllowed: summary.attemptsAllowed,
        error: summary.error,
        failureCount: summary.failureCount,
        payload: summary.payload,
      });
      // Plus an enqueuedAt ISO timestamp added by the service.
      expect(typeof payload.enqueuedAt).toBe('string');
      expect(() => new Date(payload.enqueuedAt as string).toISOString()).not.toThrow();
      // DLQ entries must NEVER auto-clean: human triage requires the job to
      // remain inspectable (CLAUDE.md §7 dead-letter pattern).
      expect(opts).toEqual({ removeOnComplete: false, removeOnFail: false });
    });

    it('should log an error with structured context for observability', async () => {
      const queue = makeQueue();
      const logger = makeLogger();
      const service = new OAuthRefreshDlqService(queue, logger);
      const summary = makeSummary({
        payload: { connectionId: 'conn-xyz', provider: 'microsoft' },
      });

      await service.publishFailed(summary);

      expect(logger.error).toHaveBeenCalledTimes(1);
      const [ctx, message] = (logger.error as jest.Mock).mock.calls[0];
      expect(ctx).toMatchObject({
        jobId: 'job-123',
        connectionId: 'conn-xyz',
        provider: 'microsoft',
        attemptsMade: 3,
        failureCount: 3,
      });
      expect(ctx.err).toBe(summary.error);
      expect(message).toMatch(/exhausted retries.*DLQ/i);
    });

    it('should propagate queue errors so the calling processor can mark the job failed', async () => {
      const queue = makeQueue();
      (queue.add as jest.Mock).mockRejectedValueOnce(new Error('redis is gone'));
      const logger = makeLogger();
      const service = new OAuthRefreshDlqService(queue, logger);

      await expect(service.publishFailed(makeSummary())).rejects.toThrow(/redis is gone/);
    });
  });
});
