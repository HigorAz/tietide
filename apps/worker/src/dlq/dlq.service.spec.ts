import { Test, type TestingModule } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import { getQueueToken } from '@nestjs/bullmq';
import { DlqService, type FailedJobSummary } from './dlq.service';
import { DLQ_JOB_NAME, DLQ_QUEUE_NAME, MAX_EXECUTION_ATTEMPTS } from './dlq.constants';

describe('DlqService', () => {
  let service: DlqService;
  let dlqQueue: { add: jest.Mock };
  let logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock };

  beforeEach(async () => {
    dlqQueue = { add: jest.fn(async () => undefined) };
    logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DlqService,
        { provide: getQueueToken(DLQ_QUEUE_NAME), useValue: dlqQueue },
        { provide: Logger, useValue: logger },
      ],
    }).compile();

    service = module.get(DlqService);
  });

  describe('publishFailed', () => {
    it('should push the failed job payload onto the DLQ queue when retries are exhausted', async () => {
      const summary: FailedJobSummary = {
        jobId: 'job-1',
        attemptsMade: MAX_EXECUTION_ATTEMPTS,
        attemptsAllowed: MAX_EXECUTION_ATTEMPTS,
        failedAt: new Date('2026-04-27T12:00:00Z'),
        error: 'database down',
        payload: {
          executionId: 'exec-1',
          workflowId: 'wf-1',
          triggerType: 'manual',
          userId: 'user-1',
        },
      };

      await service.publishFailed(summary);

      expect(dlqQueue.add).toHaveBeenCalledTimes(1);
      const [jobName, body] = dlqQueue.add.mock.calls[0];
      expect(jobName).toBe(DLQ_JOB_NAME);
      expect(body).toEqual(
        expect.objectContaining({
          jobId: 'job-1',
          attemptsMade: MAX_EXECUTION_ATTEMPTS,
          error: 'database down',
          payload: expect.objectContaining({ executionId: 'exec-1' }),
        }),
      );
      expect(logger.error).toHaveBeenCalled();
    });

    it('should NOT push to DLQ when there are retries remaining', async () => {
      const summary: FailedJobSummary = {
        jobId: 'job-2',
        attemptsMade: 1,
        attemptsAllowed: MAX_EXECUTION_ATTEMPTS,
        failedAt: new Date(),
        error: 'transient blip',
        payload: { executionId: 'exec-2', workflowId: 'wf-2', triggerType: 'manual' },
      };

      await service.publishFailed(summary);

      expect(dlqQueue.add).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should treat attemptsMade greater than attemptsAllowed as exhausted', async () => {
      const summary: FailedJobSummary = {
        jobId: 'job-3',
        attemptsMade: MAX_EXECUTION_ATTEMPTS + 1,
        attemptsAllowed: MAX_EXECUTION_ATTEMPTS,
        failedAt: new Date(),
        error: 'still broken',
        payload: { executionId: 'exec-3', workflowId: 'wf-3', triggerType: 'manual' },
      };

      await service.publishFailed(summary);

      expect(dlqQueue.add).toHaveBeenCalledTimes(1);
    });
  });
});
