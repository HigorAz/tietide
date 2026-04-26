import { Test, type TestingModule } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import type { Job } from 'bullmq';
import { EngineService } from '../engine/engine.service';
import { WorkflowProcessor, type ExecutionPayload } from './workflow.processor';

describe('WorkflowProcessor', () => {
  let processor: WorkflowProcessor;
  let engine: { execute: jest.Mock };
  let logger: { log: jest.Mock; error: jest.Mock };

  beforeEach(async () => {
    engine = { execute: jest.fn(async () => undefined) };
    logger = { log: jest.fn(), error: jest.fn() };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowProcessor,
        { provide: EngineService, useValue: engine },
        { provide: Logger, useValue: logger },
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
});
