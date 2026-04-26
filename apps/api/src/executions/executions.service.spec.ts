import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionsService } from './executions.service';
import { EXECUTION_QUEUE_NAME } from './execution-queue.constants';

interface PrismaMock {
  workflow: {
    findUnique: jest.Mock;
  };
  workflowExecution: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
  };
  executionStep: {
    findMany: jest.Mock;
  };
}

interface QueueMock {
  add: jest.Mock;
}

describe('ExecutionsService', () => {
  let service: ExecutionsService;
  let prisma: PrismaMock;
  let queue: QueueMock;

  const userId = 'user-uuid-1';
  const otherUserId = 'user-uuid-2';
  const workflowId = '550e8400-e29b-41d4-a716-446655440000';
  const executionId = '11111111-1111-4111-8111-111111111111';

  beforeEach(async () => {
    prisma = {
      workflow: { findUnique: jest.fn() },
      workflowExecution: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
      executionStep: { findMany: jest.fn() },
    };
    queue = { add: jest.fn(async () => undefined) };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        ExecutionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(EXECUTION_QUEUE_NAME), useValue: queue },
      ],
    }).compile();

    service = mod.get(ExecutionsService);
    jest.clearAllMocks();
  });

  describe('triggerManual', () => {
    it('should create a PENDING execution and enqueue a BullMQ job for the owner', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, userId });
      prisma.workflowExecution.create.mockResolvedValue({
        id: executionId,
        workflowId,
        status: 'PENDING',
        triggerType: 'manual',
        triggerData: null,
        idempotencyKey: null,
        createdAt: new Date('2026-04-24T00:00:00Z'),
      });

      const result = await service.triggerManual(userId, workflowId, {});

      expect(prisma.workflow.findUnique).toHaveBeenCalledWith({
        where: { id: workflowId },
        select: { id: true, userId: true },
      });
      expect(prisma.workflowExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workflowId,
            status: 'PENDING',
            triggerType: 'manual',
          }),
        }),
      );
      expect(queue.add).toHaveBeenCalledWith(
        'execute',
        expect.objectContaining({
          executionId,
          workflowId,
          triggerType: 'manual',
          userId,
        }),
        expect.any(Object),
      );
      expect(result).toEqual(
        expect.objectContaining({
          id: executionId,
          status: 'PENDING',
          workflowId,
          triggerType: 'manual',
        }),
      );
    });

    it('should throw NotFoundException when the workflow does not exist', async () => {
      prisma.workflow.findUnique.mockResolvedValue(null);

      await expect(service.triggerManual(userId, workflowId, {})).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.workflowExecution.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when the workflow belongs to another user', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, userId: otherUserId });

      await expect(service.triggerManual(userId, workflowId, {})).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.workflowExecution.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('should pass triggerData to the queue payload when provided', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, userId });
      prisma.workflowExecution.create.mockResolvedValue({
        id: executionId,
        workflowId,
        status: 'PENDING',
        triggerType: 'manual',
        triggerData: { foo: 'bar' },
        idempotencyKey: null,
        createdAt: new Date(),
      });

      await service.triggerManual(userId, workflowId, { triggerData: { foo: 'bar' } });

      expect(queue.add).toHaveBeenCalledWith(
        'execute',
        expect.objectContaining({ triggerData: { foo: 'bar' } }),
        expect.any(Object),
      );
    });

    it('should return the existing execution when the same idempotencyKey is reused', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, userId });
      const existing = {
        id: executionId,
        workflowId,
        status: 'PENDING',
        triggerType: 'manual',
        triggerData: null,
        idempotencyKey: 'key-abc',
        createdAt: new Date(),
      };
      prisma.workflowExecution.findFirst.mockResolvedValue(existing);

      const result = await service.triggerManual(userId, workflowId, {
        idempotencyKey: 'key-abc',
      });

      expect(prisma.workflowExecution.findFirst).toHaveBeenCalledWith({
        where: { workflowId, idempotencyKey: 'key-abc' },
      });
      expect(prisma.workflowExecution.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
      expect(result.id).toBe(executionId);
    });

    it('should persist the idempotencyKey when provided and key is new', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, userId });
      prisma.workflowExecution.findFirst.mockResolvedValue(null);
      prisma.workflowExecution.create.mockResolvedValue({
        id: executionId,
        workflowId,
        status: 'PENDING',
        triggerType: 'manual',
        triggerData: null,
        idempotencyKey: 'key-abc',
        createdAt: new Date(),
      });

      await service.triggerManual(userId, workflowId, { idempotencyKey: 'key-abc' });

      expect(prisma.workflowExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ idempotencyKey: 'key-abc' }),
        }),
      );
      expect(queue.add).toHaveBeenCalled();
    });

    it('should use the executionId as the BullMQ jobId for at-most-once delivery', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, userId });
      prisma.workflowExecution.create.mockResolvedValue({
        id: executionId,
        workflowId,
        status: 'PENDING',
        triggerType: 'manual',
        triggerData: null,
        idempotencyKey: null,
        createdAt: new Date(),
      });

      await service.triggerManual(userId, workflowId, {});

      const opts = queue.add.mock.calls[0][2] as { jobId?: string };
      expect(opts.jobId).toBe(executionId);
    });

    it('should propagate requestId into the BullMQ job payload for end-to-end correlation', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, userId });
      prisma.workflowExecution.create.mockResolvedValue({
        id: executionId,
        workflowId,
        status: 'PENDING',
        triggerType: 'manual',
        triggerData: null,
        idempotencyKey: null,
        createdAt: new Date(),
      });

      await service.triggerManual(userId, workflowId, { requestId: 'req-xyz' });

      expect(queue.add).toHaveBeenCalledWith(
        'execute',
        expect.objectContaining({ requestId: 'req-xyz' }),
        expect.any(Object),
      );
    });

    it('should not exhaust retries silently — opts include retry/backoff', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, userId });
      prisma.workflowExecution.create.mockResolvedValue({
        id: executionId,
        workflowId,
        status: 'PENDING',
        triggerType: 'manual',
        triggerData: null,
        idempotencyKey: null,
        createdAt: new Date(),
      });

      await service.triggerManual(userId, workflowId, {});

      const opts = queue.add.mock.calls[0][2] as {
        attempts?: number;
        backoff?: { type: string; delay: number };
        removeOnComplete?: unknown;
      };
      expect(opts.attempts).toBeGreaterThanOrEqual(1);
      expect(opts.backoff).toEqual({ type: 'exponential', delay: expect.any(Number) });
    });
  });

  describe('list', () => {
    const exec = (
      id: string,
      status = 'SUCCESS',
      createdAt = new Date('2026-04-20T10:00:00Z'),
    ) => ({
      id,
      workflowId,
      status,
      triggerType: 'manual',
      triggerData: null,
      idempotencyKey: null,
      startedAt: null,
      finishedAt: null,
      error: null,
      createdAt,
    });

    it('should return paginated executions for the workflow owner', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, userId });
      prisma.workflowExecution.findMany.mockResolvedValue([exec('e1'), exec('e2', 'FAILED')]);
      prisma.workflowExecution.count.mockResolvedValue(2);

      const result = await service.list(userId, workflowId, {});

      expect(prisma.workflow.findUnique).toHaveBeenCalledWith({
        where: { id: workflowId },
        select: { userId: true },
      });
      expect(prisma.workflowExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workflowId },
          orderBy: { createdAt: 'desc' },
          skip: 0,
          take: 20,
        }),
      );
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe('e1');
    });

    it('should throw NotFoundException when workflow does not exist', async () => {
      prisma.workflow.findUnique.mockResolvedValue(null);

      await expect(service.list(userId, workflowId, {})).rejects.toThrow(NotFoundException);
      expect(prisma.workflowExecution.findMany).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when workflow belongs to another user', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ userId: otherUserId });

      await expect(service.list(userId, workflowId, {})).rejects.toThrow(ForbiddenException);
      expect(prisma.workflowExecution.findMany).not.toHaveBeenCalled();
    });

    it('should filter by status', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ userId });
      prisma.workflowExecution.findMany.mockResolvedValue([]);
      prisma.workflowExecution.count.mockResolvedValue(0);

      await service.list(userId, workflowId, { status: 'FAILED' });

      expect(prisma.workflowExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workflowId, status: 'FAILED' },
        }),
      );
      expect(prisma.workflowExecution.count).toHaveBeenCalledWith({
        where: { workflowId, status: 'FAILED' },
      });
    });

    it('should filter by createdAt date range', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ userId });
      prisma.workflowExecution.findMany.mockResolvedValue([]);
      prisma.workflowExecution.count.mockResolvedValue(0);

      const from = new Date('2026-04-01T00:00:00Z');
      const to = new Date('2026-04-30T23:59:59Z');
      await service.list(userId, workflowId, { from, to });

      expect(prisma.workflowExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workflowId, createdAt: { gte: from, lte: to } },
        }),
      );
    });

    it('should apply pagination skip/take from page and pageSize', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ userId });
      prisma.workflowExecution.findMany.mockResolvedValue([]);
      prisma.workflowExecution.count.mockResolvedValue(0);

      await service.list(userId, workflowId, { page: 3, pageSize: 10 });

      expect(prisma.workflowExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });

  describe('findOne', () => {
    const fullExec = {
      id: executionId,
      workflowId,
      status: 'SUCCESS',
      triggerType: 'manual',
      triggerData: { foo: 'bar' },
      idempotencyKey: null,
      startedAt: new Date('2026-04-20T10:00:00Z'),
      finishedAt: new Date('2026-04-20T10:00:05Z'),
      error: null,
      createdAt: new Date('2026-04-20T09:59:00Z'),
      workflow: { userId },
    };

    it('should return execution detail for the owner', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue(fullExec);

      const result = await service.findOne(userId, executionId);

      expect(prisma.workflowExecution.findUnique).toHaveBeenCalledWith({
        where: { id: executionId },
        include: { workflow: { select: { userId: true } } },
      });
      expect(result.id).toBe(executionId);
      expect(result.status).toBe('SUCCESS');
      expect(result.triggerData).toEqual({ foo: 'bar' });
      expect(result.startedAt).toEqual(fullExec.startedAt);
      expect(result.finishedAt).toEqual(fullExec.finishedAt);
    });

    it('should throw NotFoundException when execution does not exist', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue(null);

      await expect(service.findOne(userId, executionId)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when execution belongs to another user', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        ...fullExec,
        workflow: { userId: otherUserId },
      });

      await expect(service.findOne(userId, executionId)).rejects.toThrow(ForbiddenException);
    });

    it('should redact secret-like keys in triggerData', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        ...fullExec,
        triggerData: { user: 'ada', password: 'p', authorization: 'Bearer t' },
      });

      const result = await service.findOne(userId, executionId);

      expect(result.triggerData).toEqual({
        user: 'ada',
        password: '[REDACTED]',
        authorization: '[REDACTED]',
      });
    });
  });

  describe('listSteps', () => {
    const owned = {
      id: executionId,
      workflowId,
      workflow: { userId },
    };

    const step = (overrides: Record<string, unknown> = {}) => ({
      id: 'step-1',
      executionId,
      nodeId: 'node-1',
      nodeType: 'http',
      nodeName: 'HTTP Call',
      status: 'SUCCESS',
      inputData: { url: 'https://example.com' },
      outputData: { body: 'ok' },
      error: null,
      startedAt: new Date('2026-04-20T10:00:01Z'),
      finishedAt: new Date('2026-04-20T10:00:02Z'),
      durationMs: 1000,
      ...overrides,
    });

    it('should return steps for the owner', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue(owned);
      prisma.executionStep.findMany.mockResolvedValue([step()]);

      const result = await service.listSteps(userId, executionId);

      expect(prisma.executionStep.findMany).toHaveBeenCalledWith({
        where: { executionId },
        orderBy: { startedAt: 'asc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].nodeId).toBe('node-1');
      expect(result[0].durationMs).toBe(1000);
    });

    it('should redact secret-like keys in step inputData and outputData', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue(owned);
      prisma.executionStep.findMany.mockResolvedValue([
        step({
          inputData: { url: 'https://x', headers: { Authorization: 'Bearer t' } },
          outputData: { token: 'abc', data: { ok: true } },
        }),
      ]);

      const [s] = await service.listSteps(userId, executionId);

      expect(s.inputData).toEqual({
        url: 'https://x',
        headers: { Authorization: '[REDACTED]' },
      });
      expect(s.outputData).toEqual({
        token: '[REDACTED]',
        data: { ok: true },
      });
    });

    it('should throw NotFoundException when execution does not exist', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue(null);

      await expect(service.listSteps(userId, executionId)).rejects.toThrow(NotFoundException);
      expect(prisma.executionStep.findMany).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when execution belongs to another user', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        ...owned,
        workflow: { userId: otherUserId },
      });

      await expect(service.listSteps(userId, executionId)).rejects.toThrow(ForbiddenException);
      expect(prisma.executionStep.findMany).not.toHaveBeenCalled();
    });
  });
});
