import { Test, type TestingModule } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import type { Job } from 'bullmq';
import { DlqService } from '../dlq/dlq.service';
import { MAX_EXECUTION_ATTEMPTS } from '../dlq/dlq.constants';
import { EngineService } from '../engine/engine.service';
import { WorkerMetricsService } from '../metrics/worker-metrics.service';
import { WorkflowProcessor, type ExecutionPayload } from './workflow.processor';

describe('WorkflowProcessor', () => {
  let processor: WorkflowProcessor;
  let engine: { execute: jest.Mock; failExecution: jest.Mock };
  let logger: { log: jest.Mock; error: jest.Mock };
  let dlq: { publishFailed: jest.Mock };
  let metrics: { observeExecution: jest.Mock };

  beforeEach(async () => {
    engine = {
      execute: jest.fn(async () => undefined),
      failExecution: jest.fn(async () => undefined),
    };
    logger = { log: jest.fn(), error: jest.fn() };
    dlq = { publishFailed: jest.fn(async () => undefined) };
    metrics = { observeExecution: jest.fn() };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowProcessor,
        { provide: EngineService, useValue: engine },
        { provide: Logger, useValue: logger },
        { provide: DlqService, useValue: dlq },
        { provide: WorkerMetricsService, useValue: metrics },
      ],
    }).compile();
    processor = mod.get(WorkflowProcessor);
  });

  describe('process', () => {
    it('should forward the job payload to EngineService.execute', async () => {
      const payload: ExecutionPayload = {
        executionId: 'exec-1',
        workflowId: 'wf-1',
        triggerType: 'manual',
        triggerData: { foo: 'bar' },
      };
      const job = {
        id: 'job-1',
        data: payload,
        attemptsMade: 0,
        opts: { attempts: MAX_EXECUTION_ATTEMPTS },
      } as unknown as Job<ExecutionPayload>;

      await processor.process(job);

      // Attempt metadata is threaded in so the engine knows this is a top-level,
      // BullMQ-managed job that may be retried (W1.8).
      expect(engine.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          ...payload,
          attemptsMade: 0,
          attemptsAllowed: MAX_EXECUTION_ATTEMPTS,
        }),
      );
    });

    it('observes a completed execution into the duration histogram', async () => {
      const job = {
        id: 'job-1',
        data: { executionId: 'e', workflowId: 'w', triggerType: 'manual' },
      } as unknown as Job<ExecutionPayload>;

      await processor.process(job);

      expect(metrics.observeExecution).toHaveBeenCalledWith('completed', expect.any(Number));
    });

    it('should let exceptions from EngineService bubble up for BullMQ retry', async () => {
      engine.execute.mockRejectedValue(new Error('database down'));
      const job = {
        id: 'job-1',
        data: { executionId: 'x', workflowId: 'y', triggerType: 'manual' },
      } as unknown as Job<ExecutionPayload>;

      await expect(processor.process(job)).rejects.toThrow('database down');
      expect(metrics.observeExecution).toHaveBeenCalledWith('failed', expect.any(Number));
    });

    it('should emit a structured log with executionId, workflowId, status and requestId', async () => {
      const payload: ExecutionPayload = {
        executionId: 'exec-7',
        workflowId: 'wf-7',
        triggerType: 'manual',
        requestId: 'req-corr-7',
        userId: 'user-7',
      };
      const job = { id: 'job-7', data: payload } as unknown as Job<ExecutionPayload>;

      await processor.process(job);

      expect(logger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          executionId: 'exec-7',
          workflowId: 'wf-7',
          requestId: 'req-corr-7',
          status: 'started',
        }),
        expect.any(String),
      );
      expect(logger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          executionId: 'exec-7',
          status: 'completed',
          durationMs: expect.any(Number),
        }),
        expect.any(String),
      );
    });

    it('should emit a structured error log with status=failed when the engine throws', async () => {
      engine.execute.mockRejectedValue(new Error('boom'));
      const payload: ExecutionPayload = {
        executionId: 'exec-9',
        workflowId: 'wf-9',
        triggerType: 'manual',
      };
      const job = { id: 'job-9', data: payload } as unknown as Job<ExecutionPayload>;

      await expect(processor.process(job)).rejects.toThrow('boom');

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          executionId: 'exec-9',
          status: 'failed',
          err: 'boom',
        }),
        expect.any(String),
      );
    });
  });

  describe('onFailed', () => {
    function makeJob(overrides: Partial<Job<ExecutionPayload>> = {}): Job<ExecutionPayload> {
      return {
        id: 'job-99',
        attemptsMade: MAX_EXECUTION_ATTEMPTS,
        opts: { attempts: MAX_EXECUTION_ATTEMPTS },
        data: {
          executionId: 'exec-99',
          workflowId: 'wf-99',
          triggerType: 'manual',
          userId: 'user-99',
        },
        ...overrides,
      } as unknown as Job<ExecutionPayload>;
    }

    it('should forward exhausted retries to DlqService.publishFailed', async () => {
      const job = makeJob();
      const error = new Error('database down');

      await processor.onFailed(job, error);

      expect(dlq.publishFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-99',
          attemptsMade: MAX_EXECUTION_ATTEMPTS,
          attemptsAllowed: MAX_EXECUTION_ATTEMPTS,
          error: 'database down',
          payload: expect.objectContaining({ executionId: 'exec-99' }),
        }),
      );
    });

    it('should still call DlqService when retries remain (the service decides)', async () => {
      const job = makeJob({
        id: 'job-mid',
        attemptsMade: 1,
        opts: { attempts: MAX_EXECUTION_ATTEMPTS },
      } as unknown as Partial<Job<ExecutionPayload>>);

      await processor.onFailed(job, new Error('transient'));

      expect(dlq.publishFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-mid',
          attemptsMade: 1,
          attemptsAllowed: MAX_EXECUTION_ATTEMPTS,
          error: 'transient',
        }),
      );
    });

    it('should be safe when job or error is undefined (event noise)', async () => {
      await expect(processor.onFailed(undefined, new Error('orphan'))).resolves.toBeUndefined();
      expect(dlq.publishFailed).not.toHaveBeenCalled();
    });

    it('marks the execution FAILED via the engine when retries are exhausted', async () => {
      // The engine left the row RUNNING for the retry; on exhaustion the processor
      // records the terminal failure (W1.8).
      const job = makeJob();

      await processor.onFailed(job, new Error('database down'));

      expect(engine.failExecution).toHaveBeenCalledWith('exec-99', 'database down');
    });

    it('does NOT mark the execution FAILED while retries remain', async () => {
      const job = makeJob({
        attemptsMade: 1,
        opts: { attempts: MAX_EXECUTION_ATTEMPTS },
      } as unknown as Partial<Job<ExecutionPayload>>);

      await processor.onFailed(job, new Error('transient'));

      expect(engine.failExecution).not.toHaveBeenCalled();
    });

    it('still reaches the DLQ even if marking the row FAILED throws', async () => {
      engine.failExecution.mockRejectedValueOnce(new Error('db unavailable'));
      const job = makeJob();

      await processor.onFailed(job, new Error('database down'));

      expect(dlq.publishFailed).toHaveBeenCalled();
    });
  });
});
