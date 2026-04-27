import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { PrismaService } from '../src/prisma/prisma.service';
import { ExecutionsService } from '../src/executions/executions.service';
import { EXECUTION_QUEUE_NAME } from '../src/executions/execution-queue.constants';

describe('API → Worker contract (workflow-execution queue)', () => {
  let executions: ExecutionsService;
  let prisma: {
    workflow: { findUnique: jest.Mock };
    workflowExecution: { findFirst: jest.Mock; create: jest.Mock };
  };
  let queue: { add: jest.Mock };

  const userId = 'user-1';
  const workflowId = '550e8400-e29b-41d4-a716-446655440000';
  const executionId = '11111111-1111-4111-8111-111111111111';

  beforeEach(async () => {
    prisma = {
      workflow: { findUnique: jest.fn() },
      workflowExecution: { findFirst: jest.fn(), create: jest.fn() },
    };
    queue = { add: jest.fn(async () => undefined) };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        ExecutionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(EXECUTION_QUEUE_NAME), useValue: queue },
      ],
    }).compile();

    executions = mod.get(ExecutionsService);

    prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, userId });
    prisma.workflowExecution.findFirst.mockResolvedValue(null);
    prisma.workflowExecution.create.mockResolvedValue({
      id: executionId,
      workflowId,
      status: 'PENDING',
      triggerType: 'manual',
      triggerData: { hello: 'world' },
      idempotencyKey: null,
      createdAt: new Date(),
    });
  });

  it('emits a payload that satisfies the Worker WorkflowProcessor contract', async () => {
    await executions.triggerManual(userId, workflowId, { triggerData: { hello: 'world' } });

    expect(queue.add).toHaveBeenCalledTimes(1);
    const [jobName, payload, opts] = queue.add.mock.calls[0] as [
      string,
      Record<string, unknown>,
      Record<string, unknown>,
    ];

    expect(jobName).toBe('execute');
    expect(payload).toEqual(
      expect.objectContaining({
        executionId,
        workflowId,
        triggerType: 'manual',
        triggerData: { hello: 'world' },
        userId,
      }),
    );

    expect(typeof payload.executionId).toBe('string');
    expect(typeof payload.workflowId).toBe('string');
    expect(typeof payload.triggerType).toBe('string');
    expect(typeof payload.userId).toBe('string');

    expect(opts).toEqual(
      expect.objectContaining({
        jobId: executionId,
        attempts: 3,
        backoff: expect.objectContaining({ type: 'exponential', delay: expect.any(Number) }),
      }),
    );
  });

  it('configures retries with exponential backoff so transient failures are retried up to 3 times', async () => {
    await executions.triggerManual(userId, workflowId, {});

    const opts = queue.add.mock.calls[0][2] as {
      attempts: number;
      backoff: { type: string; delay: number };
    };

    expect(opts.attempts).toBe(3);
    expect(opts.backoff.type).toBe('exponential');
    expect(opts.backoff.delay).toBeGreaterThan(0);
  });

  it('persists execution as PENDING before enqueuing — queue.add fires after DB create', async () => {
    const order: string[] = [];
    prisma.workflowExecution.create.mockImplementation(async () => {
      order.push('db');
      return {
        id: executionId,
        workflowId,
        status: 'PENDING',
        triggerType: 'manual',
        triggerData: null,
        idempotencyKey: null,
        createdAt: new Date(),
      };
    });
    queue.add.mockImplementation(async () => {
      order.push('queue');
    });

    await executions.triggerManual(userId, workflowId, {});

    expect(order).toEqual(['db', 'queue']);
  });
});
