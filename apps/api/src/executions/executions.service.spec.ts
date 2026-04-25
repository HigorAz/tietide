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
    create: jest.Mock;
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
        create: jest.fn(),
      },
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
});
