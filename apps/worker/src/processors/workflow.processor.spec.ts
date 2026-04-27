import { Test, type TestingModule } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import type { Job } from 'bullmq';
import { DlqService } from '../dlq/dlq.service';
import { MAX_EXECUTION_ATTEMPTS } from '../dlq/dlq.constants';
import { EngineService } from '../engine/engine.service';
import { WorkflowProcessor, type ExecutionPayload } from './workflow.processor';

describe('WorkflowProcessor', () => {
  let processor: WorkflowProcessor;
  let engine: { execute: jest.Mock };
  let logger: { log: jest.Mock; error: jest.Mock };
  let dlq: { publishFailed: jest.Mock };

  beforeEach(async () => {
    engine = { execute: jest.fn(async () => undefined) };
    logger = { log: jest.fn(), error: jest.fn() };
    dlq = { publishFailed: jest.fn(async () => undefined) };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowProcessor,
        { provide: EngineService, useValue: engine },
        { provide: Logger, useValue: logger },
        { provide: DlqService, useValue: dlq },
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
      const job = { id: 'job-1', data: payload } as unknown as Job<ExecutionPayload>;

      await processor.process(job);

      expect(engine.execute).toHaveBeenCalledWith(payload);
    });

    it('should let exceptions from EngineService bubble up for BullMQ retry', async () => {
      engine.execute.mockRejectedValue(new Error('database down'));
      const job = {
        id: 'job-1',
        data: { executionId: 'x', workflowId: 'y', triggerType: 'manual' },
      } as unknown as Job<ExecutionPayload>;

      await expect(processor.process(job)).rejects.toThrow('database down');
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
  });
});
