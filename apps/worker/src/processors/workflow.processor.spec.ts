import { Test, type TestingModule } from '@nestjs/testing';
import type { Job } from 'bullmq';
import { EngineService } from '../engine/engine.service';
import { WorkflowProcessor, type ExecutionPayload } from './workflow.processor';

describe('WorkflowProcessor', () => {
  let processor: WorkflowProcessor;
  let engine: { execute: jest.Mock };

  beforeEach(async () => {
    engine = { execute: jest.fn(async () => undefined) };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [WorkflowProcessor, { provide: EngineService, useValue: engine }],
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
  });
});
