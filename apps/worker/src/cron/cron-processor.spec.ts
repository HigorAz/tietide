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

const buildJob = (overrides: Partial<CronFirePayload> = {}): Job<CronFirePayload> => {
  const data: CronFirePayload = {
    workflowId: 'wf-1',
    userId: 'user-1',
    expression: '*/5 * * * *',
    ...overrides,
  };
  return {
    id: 'job-1',
    name: 'cron-fire',
    data,
    opts: { repeat: { pattern: data.expression } },
    processedOn: 1700000000000,
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
  });
});
