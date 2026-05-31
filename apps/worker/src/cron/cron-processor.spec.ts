import { Test, type TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { EXECUTION_QUEUE_NAME } from './cron.constants';
import { CronProcessor, type CronFirePayload } from './cron-processor';

interface PrismaMock {
  workflow: { findUnique: jest.Mock };
  workflowExecution: { create: jest.Mock; findFirst: jest.Mock };
}

interface QueueMock {
  add: jest.Mock;
}

const buildJob = (
  overrides: Partial<CronFirePayload> = {},
  jobOverrides: Partial<Job<CronFirePayload>> = {},
): Job<CronFirePayload> => {
  const data: CronFirePayload = {
    workflowId: 'wf-1',
    userId: 'user-1',
    expression: '*/5 * * * *',
    ...overrides,
  };
  return {
    // BullMQ job-scheduler job id: ends in the scheduled epoch millis.
    id: 'repeat:cron:wf-1:1700000000000',
    name: 'cron-fire',
    data,
    opts: { repeat: { pattern: data.expression } },
    timestamp: 1700000000000,
    // Processing time deliberately differs from the scheduled time — it must NOT
    // leak into the idempotency key.
    processedOn: 1700000005000,
    ...jobOverrides,
  } as unknown as Job<CronFirePayload>;
};

describe('CronProcessor', () => {
  let processor: CronProcessor;
  let prisma: PrismaMock;
  let executionQueue: QueueMock;

  beforeEach(async () => {
    prisma = {
      workflow: { findUnique: jest.fn() },
      workflowExecution: {
        create: jest.fn(async (args: { data: { id?: string } }) => ({
          id: args.data.id ?? 'exec-new',
          ...args.data,
        })),
        findFirst: jest.fn(async () => null),
      },
    };
    executionQueue = { add: jest.fn(async () => ({ id: 'job' })) };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        CronProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(EXECUTION_QUEUE_NAME), useValue: executionQueue },
      ],
    }).compile();

    processor = mod.get(CronProcessor);
  });

  describe('process', () => {
    it('should look up the workflow before queueing an execution', async () => {
      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-1',
        userId: 'user-1',
        isActive: true,
      });

      await processor.process(buildJob());

      expect(prisma.workflow.findUnique).toHaveBeenCalledWith({
        where: { id: 'wf-1' },
        select: { id: true, userId: true, isActive: true },
      });
    });

    it('should create a WorkflowExecution row with a deterministic idempotency key', async () => {
      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-1',
        userId: 'user-1',
        isActive: true,
      });

      await processor.process(buildJob());

      expect(prisma.workflowExecution.create).toHaveBeenCalledTimes(1);
      const arg = prisma.workflowExecution.create.mock.calls[0][0];
      expect(arg.data).toEqual(
        expect.objectContaining({
          workflowId: 'wf-1',
          status: 'PENDING',
          triggerType: 'cron',
          idempotencyKey: expect.stringMatching(/^cron:wf-1:/),
        }),
      );
    });

    it('keys idempotency on the scheduled time, stable across processing-time (processedOn) drift', async () => {
      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-1',
        userId: 'user-1',
        isActive: true,
      });

      // Same scheduled tick (same scheduler job id), processed at two very
      // different wall-clock moments — the dedup key must be identical.
      await processor.process(buildJob({}, { processedOn: 1700000009999 }));
      await processor.process(buildJob({}, { processedOn: 1700000088888 }));

      const k1 = prisma.workflowExecution.create.mock.calls[0][0].data.idempotencyKey;
      const k2 = prisma.workflowExecution.create.mock.calls[1][0].data.idempotencyKey;
      expect(k1).toBe(k2);
      expect(k1).toBe(`cron:wf-1:${new Date(1700000000000).toISOString()}`);
    });

    it('should enqueue an execution job to the workflow-execution queue with the userId from DB', async () => {
      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-1',
        userId: 'owner-7',
        isActive: true,
      });

      await processor.process(buildJob({ userId: 'spoofed-user' }));

      expect(executionQueue.add).toHaveBeenCalledTimes(1);
      const [jobName, payload, opts] = executionQueue.add.mock.calls[0];
      expect(jobName).toBe('execute');
      expect(payload).toEqual(
        expect.objectContaining({
          workflowId: 'wf-1',
          triggerType: 'cron',
          userId: 'owner-7',
        }),
      );
      expect(opts).toEqual(expect.objectContaining({ jobId: expect.any(String) }));
    });

    it('should skip when the workflow is no longer active (lock against stale repeatables)', async () => {
      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-1',
        userId: 'user-1',
        isActive: false,
      });

      await processor.process(buildJob());

      expect(prisma.workflowExecution.create).not.toHaveBeenCalled();
      expect(executionQueue.add).not.toHaveBeenCalled();
    });

    it('should skip when the workflow no longer exists', async () => {
      prisma.workflow.findUnique.mockResolvedValue(null);

      await processor.process(buildJob());

      expect(prisma.workflowExecution.create).not.toHaveBeenCalled();
      expect(executionQueue.add).not.toHaveBeenCalled();
    });

    it('should not duplicate when the same scheduled tick fires twice (idempotency lock)', async () => {
      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-1',
        userId: 'user-1',
        isActive: true,
      });
      prisma.workflowExecution.findFirst.mockResolvedValue({ id: 'exec-existing' });

      await processor.process(buildJob());

      expect(prisma.workflowExecution.create).not.toHaveBeenCalled();
      expect(executionQueue.add).not.toHaveBeenCalled();
    });

    it('should treat a concurrent insert that loses the unique-constraint race (P2002) as a duplicate', async () => {
      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-1',
        userId: 'user-1',
        isActive: true,
      });
      // The pre-create findFirst sees nothing, but a concurrent tick commits the
      // same cron:<wf>:<ts> key first, so create loses on the unique constraint.
      prisma.workflowExecution.findFirst.mockResolvedValue(null);
      prisma.workflowExecution.create.mockRejectedValue(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      );

      await expect(processor.process(buildJob())).resolves.toBeUndefined();

      // The winner already enqueued the run — we must not enqueue a duplicate.
      expect(executionQueue.add).not.toHaveBeenCalled();
    });

    it('should rethrow a non-unique create error so the tick fails and retries', async () => {
      prisma.workflow.findUnique.mockResolvedValue({
        id: 'wf-1',
        userId: 'user-1',
        isActive: true,
      });
      prisma.workflowExecution.findFirst.mockResolvedValue(null);
      prisma.workflowExecution.create.mockRejectedValue(
        Object.assign(new Error('db down'), { code: 'P1001' }),
      );

      await expect(processor.process(buildJob())).rejects.toThrow('db down');
      expect(executionQueue.add).not.toHaveBeenCalled();
    });
  });
});
