import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { WorkflowDefinition } from '@tietide/shared';
import { getQueueToken } from '@nestjs/bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { PaymentRequiredException } from '../billing/payment-required.exception';
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
  let audit: { log: jest.Mock };
  let entitlements: { assertCanRun: jest.Mock; enforceRunCapAround: jest.Mock };

  const userId = 'user-uuid-1';
  const organizationId = 'org-uuid-1';
  const otherOrganizationId = 'org-uuid-2';
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
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    entitlements = {
      assertCanRun: jest.fn().mockResolvedValue(undefined),
      // The atomic run-cap wrapper just runs the caller's create against the
      // prisma mock (tx === prisma in these unit tests) by default; the cap
      // re-check is covered in entitlements.service.spec.ts.
      enforceRunCapAround: jest
        .fn()
        .mockImplementation((_orgId: string, create: (tx: typeof prisma) => unknown) =>
          create(prisma),
        ),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        ExecutionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(EXECUTION_QUEUE_NAME), useValue: queue },
        { provide: AuditLogService, useValue: audit },
        { provide: EntitlementsService, useValue: entitlements },
      ],
    }).compile();

    service = mod.get(ExecutionsService);
    jest.clearAllMocks();
  });

  describe('triggerManual', () => {
    it('rejects with 402 and creates no execution when the run quota is exhausted', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, organizationId });
      entitlements.assertCanRun.mockRejectedValueOnce(
        new PaymentRequiredException('runs', 'over quota'),
      );

      await expect(
        service.triggerManual(organizationId, userId, workflowId, {}),
      ).rejects.toBeInstanceOf(PaymentRequiredException);
      expect(entitlements.assertCanRun).toHaveBeenCalledWith(organizationId);
      expect(prisma.workflowExecution.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('should create a PENDING execution and enqueue a BullMQ job for the owner', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, organizationId });
      prisma.workflowExecution.create.mockResolvedValue({
        id: executionId,
        workflowId,
        status: 'PENDING',
        triggerType: 'manual',
        triggerData: null,
        idempotencyKey: null,
        createdAt: new Date('2026-04-24T00:00:00Z'),
      });

      const result = await service.triggerManual(organizationId, userId, workflowId, {});

      expect(prisma.workflow.findUnique).toHaveBeenCalledWith({
        where: { id: workflowId },
        select: { id: true, organizationId: true },
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
          organizationId,
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

    it('creates the execution through the atomic run-cap wrapper (W5.25)', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, organizationId });
      prisma.workflowExecution.create.mockResolvedValue({
        id: executionId,
        workflowId,
        status: 'PENDING',
        triggerType: 'manual',
        triggerData: null,
        idempotencyKey: null,
        createdAt: new Date(),
      });

      await service.triggerManual(organizationId, userId, workflowId, {});

      expect(entitlements.enforceRunCapAround).toHaveBeenCalledWith(
        organizationId,
        expect.any(Function),
      );
      expect(prisma.workflowExecution.create).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when the workflow does not exist', async () => {
      prisma.workflow.findUnique.mockResolvedValue(null);

      await expect(service.triggerManual(organizationId, userId, workflowId, {})).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.workflowExecution.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when the workflow belongs to another user', async () => {
      prisma.workflow.findUnique.mockResolvedValue({
        id: workflowId,
        organizationId: otherOrganizationId,
      });

      await expect(service.triggerManual(organizationId, userId, workflowId, {})).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.workflowExecution.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('should pass triggerData to the queue payload when provided', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, organizationId });
      prisma.workflowExecution.create.mockResolvedValue({
        id: executionId,
        workflowId,
        status: 'PENDING',
        triggerType: 'manual',
        triggerData: { foo: 'bar' },
        idempotencyKey: null,
        createdAt: new Date(),
      });

      await service.triggerManual(organizationId, userId, workflowId, {
        triggerData: { foo: 'bar' },
      });

      expect(queue.add).toHaveBeenCalledWith(
        'execute',
        expect.objectContaining({ triggerData: { foo: 'bar' } }),
        expect.any(Object),
      );
    });

    it('should return the existing execution when the same idempotencyKey is reused', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, organizationId });
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

      const result = await service.triggerManual(organizationId, userId, workflowId, {
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
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, organizationId });
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

      await service.triggerManual(organizationId, userId, workflowId, {
        idempotencyKey: 'key-abc',
      });

      expect(prisma.workflowExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ idempotencyKey: 'key-abc' }),
        }),
      );
      expect(queue.add).toHaveBeenCalled();
    });

    it('should return the existing execution when a concurrent create races the unique constraint (P2002)', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, organizationId });
      // Pre-create dedup check sees nothing (the racing request has not committed
      // yet), so we proceed to create — which then loses the race and the unique
      // constraint rejects with P2002. The post-catch re-fetch finds the winner.
      const winner = {
        id: executionId,
        workflowId,
        status: 'PENDING',
        triggerType: 'manual',
        triggerData: null,
        idempotencyKey: 'key-race',
        createdAt: new Date(),
      };
      prisma.workflowExecution.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
      prisma.workflowExecution.create.mockRejectedValue(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      );

      const result = await service.triggerManual(organizationId, userId, workflowId, {
        idempotencyKey: 'key-race',
      });

      expect(result.id).toBe(executionId);
      // The loser must NOT enqueue a duplicate job — the winner already did.
      expect(queue.add).not.toHaveBeenCalled();
      expect(prisma.workflowExecution.findFirst).toHaveBeenLastCalledWith({
        where: { workflowId, idempotencyKey: 'key-race' },
      });
    });

    it('should rethrow a non-unique create error unchanged', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, organizationId });
      prisma.workflowExecution.findFirst.mockResolvedValue(null);
      prisma.workflowExecution.create.mockRejectedValue(
        Object.assign(new Error('connection reset'), { code: 'P1001' }),
      );

      await expect(
        service.triggerManual(organizationId, userId, workflowId, { idempotencyKey: 'key-x' }),
      ).rejects.toThrow('connection reset');
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('should use the executionId as the BullMQ jobId for at-most-once delivery', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, organizationId });
      prisma.workflowExecution.create.mockResolvedValue({
        id: executionId,
        workflowId,
        status: 'PENDING',
        triggerType: 'manual',
        triggerData: null,
        idempotencyKey: null,
        createdAt: new Date(),
      });

      await service.triggerManual(organizationId, userId, workflowId, {});

      const opts = queue.add.mock.calls[0][2] as { jobId?: string };
      expect(opts.jobId).toBe(executionId);
    });

    it('should propagate requestId into the BullMQ job payload for end-to-end correlation', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, organizationId });
      prisma.workflowExecution.create.mockResolvedValue({
        id: executionId,
        workflowId,
        status: 'PENDING',
        triggerType: 'manual',
        triggerData: null,
        idempotencyKey: null,
        createdAt: new Date(),
      });

      await service.triggerManual(organizationId, userId, workflowId, { requestId: 'req-xyz' });

      expect(queue.add).toHaveBeenCalledWith(
        'execute',
        expect.objectContaining({ requestId: 'req-xyz' }),
        expect.any(Object),
      );
    });

    it('should not exhaust retries silently — opts include retry/backoff', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, organizationId });
      prisma.workflowExecution.create.mockResolvedValue({
        id: executionId,
        workflowId,
        status: 'PENDING',
        triggerType: 'manual',
        triggerData: null,
        idempotencyKey: null,
        createdAt: new Date(),
      });

      await service.triggerManual(organizationId, userId, workflowId, {});

      const opts = queue.add.mock.calls[0][2] as {
        attempts?: number;
        backoff?: { type: string; delay: number };
        removeOnComplete?: unknown;
      };
      expect(opts.attempts).toBeGreaterThanOrEqual(1);
      expect(opts.backoff).toEqual({ type: 'exponential', delay: expect.any(Number) });
    });

    it('should record an audit log entry with action "execution.trigger"', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, organizationId });
      prisma.workflowExecution.create.mockResolvedValue({
        id: executionId,
        workflowId,
        status: 'PENDING',
        triggerType: 'manual',
        triggerData: null,
        idempotencyKey: null,
        createdAt: new Date(),
      });

      await service.triggerManual(organizationId, userId, workflowId, {});

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          organizationId,
          action: 'execution.trigger',
          resource: 'workflow',
          resourceId: workflowId,
          metadata: expect.objectContaining({ executionId, triggerType: 'manual' }),
        }),
      );
    });
  });

  describe('triggerTest', () => {
    const definition = {
      nodes: [
        {
          id: 'n1',
          type: 'manual-trigger',
          name: 'Start',
          position: { x: 0, y: 0 },
          config: {},
        },
      ],
      edges: [],
    };

    it('should create a PENDING dry-run execution and enqueue a job with the override definition', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, organizationId });
      prisma.workflowExecution.create.mockResolvedValue({
        id: executionId,
        workflowId,
        status: 'PENDING',
        triggerType: 'test',
        triggerData: null,
        idempotencyKey: null,
        isDryRun: true,
        createdAt: new Date('2026-05-07T00:00:00Z'),
      });

      const result = await service.triggerTest(organizationId, userId, workflowId, { definition });

      expect(prisma.workflow.findUnique).toHaveBeenCalledWith({
        where: { id: workflowId },
        select: { id: true, organizationId: true },
      });
      expect(prisma.workflowExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workflowId,
            status: 'PENDING',
            triggerType: 'test',
            isDryRun: true,
            idempotencyKey: null,
          }),
        }),
      );
      expect(queue.add).toHaveBeenCalledWith(
        'execute',
        expect.objectContaining({
          executionId,
          workflowId,
          triggerType: 'test',
          userId,
          organizationId,
          isDryRun: true,
          definitionOverride: definition,
        }),
        expect.any(Object),
      );
      expect(result).toEqual(
        expect.objectContaining({
          id: executionId,
          status: 'PENDING',
          workflowId,
          triggerType: 'test',
          isDryRun: true,
        }),
      );
    });

    it('should throw NotFoundException when the workflow does not exist', async () => {
      prisma.workflow.findUnique.mockResolvedValue(null);

      await expect(
        service.triggerTest(organizationId, userId, workflowId, { definition }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.workflowExecution.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when the workflow belongs to another user', async () => {
      prisma.workflow.findUnique.mockResolvedValue({
        id: workflowId,
        organizationId: otherOrganizationId,
      });

      await expect(
        service.triggerTest(organizationId, userId, workflowId, { definition }),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.workflowExecution.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('should never check or persist an idempotency key (test runs are exploratory)', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, organizationId });
      prisma.workflowExecution.create.mockResolvedValue({
        id: executionId,
        workflowId,
        status: 'PENDING',
        triggerType: 'test',
        triggerData: null,
        idempotencyKey: null,
        isDryRun: true,
        createdAt: new Date(),
      });

      await service.triggerTest(organizationId, userId, workflowId, { definition });

      expect(prisma.workflowExecution.findFirst).not.toHaveBeenCalled();
      expect(prisma.workflowExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ idempotencyKey: null }),
        }),
      );
    });

    it('should record an audit log entry with action "execution.test"', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, organizationId });
      prisma.workflowExecution.create.mockResolvedValue({
        id: executionId,
        workflowId,
        status: 'PENDING',
        triggerType: 'test',
        triggerData: null,
        idempotencyKey: null,
        isDryRun: true,
        createdAt: new Date(),
      });

      await service.triggerTest(organizationId, userId, workflowId, { definition });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          organizationId,
          action: 'execution.test',
          resource: 'workflow',
          resourceId: workflowId,
          metadata: expect.objectContaining({ executionId, triggerType: 'test' }),
        }),
      );
    });

    it('should propagate triggerData and requestId into the BullMQ job payload', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, organizationId });
      prisma.workflowExecution.create.mockResolvedValue({
        id: executionId,
        workflowId,
        status: 'PENDING',
        triggerType: 'test',
        triggerData: { foo: 'bar' },
        idempotencyKey: null,
        isDryRun: true,
        createdAt: new Date(),
      });

      await service.triggerTest(organizationId, userId, workflowId, {
        definition,
        triggerData: { foo: 'bar' },
        requestId: 'req-test-1',
      });

      expect(queue.add).toHaveBeenCalledWith(
        'execute',
        expect.objectContaining({
          triggerData: { foo: 'bar' },
          requestId: 'req-test-1',
        }),
        expect.any(Object),
      );
    });
  });

  describe('triggerNodeTest', () => {
    const definition = {
      nodes: [
        { id: 'n1', type: 'manual-trigger', name: 'Start', position: { x: 0, y: 0 }, config: {} },
        {
          id: 'n2',
          type: 'http-request',
          name: 'Fetch',
          position: { x: 1, y: 0 },
          config: { url: 'https://api.example.com' },
        },
        {
          id: 'n3',
          type: 'http-request',
          name: 'After',
          position: { x: 2, y: 0 },
          config: {},
        },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' },
      ],
    };

    const mockPending = () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, organizationId });
      prisma.workflowExecution.create.mockResolvedValue({
        id: executionId,
        workflowId,
        status: 'PENDING',
        triggerType: 'node-test',
        triggerData: null,
        idempotencyKey: null,
        isDryRun: false,
        createdAt: new Date('2026-05-31T00:00:00Z'),
      });
    };

    it('enqueues a non-dry-run execution with the single-node subgraph as the override', async () => {
      mockPending();

      const result = await service.triggerNodeTest(organizationId, userId, workflowId, 'n2', {
        definition,
      });

      expect(prisma.workflowExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workflowId,
            status: 'PENDING',
            triggerType: 'node-test',
            isDryRun: false,
          }),
        }),
      );
      const payload = queue.add.mock.calls[0][1] as {
        isDryRun: boolean;
        triggerType: string;
        definitionOverride: { nodes: { id: string }[]; edges: { id: string }[] };
      };
      expect(payload.isDryRun).toBe(false);
      expect(payload.triggerType).toBe('node-test');
      // Subgraph is target n2 + ancestor n1; downstream n3 excluded.
      expect(payload.definitionOverride.nodes.map((n) => n.id).sort()).toEqual(['n1', 'n2']);
      expect(payload.definitionOverride.edges.map((e) => e.id)).toEqual(['e1']);
      expect(result).toEqual(
        expect.objectContaining({ id: executionId, status: 'PENDING', triggerType: 'node-test' }),
      );
    });

    it('throws NotFoundException when the workflow does not exist', async () => {
      prisma.workflow.findUnique.mockResolvedValue(null);

      await expect(
        service.triggerNodeTest(organizationId, userId, workflowId, 'n2', { definition }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.workflowExecution.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the workflow belongs to another user', async () => {
      prisma.workflow.findUnique.mockResolvedValue({
        id: workflowId,
        organizationId: otherOrganizationId,
      });

      await expect(
        service.triggerNodeTest(organizationId, userId, workflowId, 'n2', { definition }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.workflowExecution.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the node is not in the definition', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, organizationId });

      await expect(
        service.triggerNodeTest(organizationId, userId, workflowId, 'does-not-exist', {
          definition,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.workflowExecution.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('records an audit log entry with action "execution.node-test"', async () => {
      mockPending();

      await service.triggerNodeTest(organizationId, userId, workflowId, 'n2', { definition });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          organizationId,
          action: 'execution.node-test',
          resource: 'workflow',
          resourceId: workflowId,
          metadata: expect.objectContaining({ executionId, nodeId: 'n2' }),
        }),
      );
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
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, organizationId });
      prisma.workflowExecution.findMany.mockResolvedValue([exec('e1'), exec('e2', 'FAILED')]);
      prisma.workflowExecution.count.mockResolvedValue(2);

      const result = await service.list(organizationId, workflowId, {});

      expect(prisma.workflow.findUnique).toHaveBeenCalledWith({
        where: { id: workflowId },
        select: { organizationId: true },
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

      await expect(service.list(organizationId, workflowId, {})).rejects.toThrow(NotFoundException);
      expect(prisma.workflowExecution.findMany).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when workflow belongs to another user', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ organizationId: otherOrganizationId });

      await expect(service.list(organizationId, workflowId, {})).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.workflowExecution.findMany).not.toHaveBeenCalled();
    });

    it('should filter by status', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ organizationId });
      prisma.workflowExecution.findMany.mockResolvedValue([]);
      prisma.workflowExecution.count.mockResolvedValue(0);

      await service.list(organizationId, workflowId, { status: 'FAILED' });

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
      prisma.workflow.findUnique.mockResolvedValue({ organizationId });
      prisma.workflowExecution.findMany.mockResolvedValue([]);
      prisma.workflowExecution.count.mockResolvedValue(0);

      const from = new Date('2026-04-01T00:00:00Z');
      const to = new Date('2026-04-30T23:59:59Z');
      await service.list(organizationId, workflowId, { from, to });

      expect(prisma.workflowExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workflowId, createdAt: { gte: from, lte: to } },
        }),
      );
    });

    it('should apply pagination skip/take from page and pageSize', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ organizationId });
      prisma.workflowExecution.findMany.mockResolvedValue([]);
      prisma.workflowExecution.count.mockResolvedValue(0);

      await service.list(organizationId, workflowId, { page: 3, pageSize: 10 });

      expect(prisma.workflowExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });

  describe('listAllForOrg', () => {
    const exec = (
      id: string,
      wfId: string,
      status = 'SUCCESS',
      createdAt = new Date('2026-04-20T10:00:00Z'),
    ) => ({
      id,
      workflowId: wfId,
      status,
      triggerType: 'manual',
      triggerData: null,
      idempotencyKey: null,
      startedAt: null,
      finishedAt: null,
      error: null,
      createdAt,
    });

    it('should return paginated executions filtered by workflow.organizationId via the relation', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([
        exec('e1', 'wf-a'),
        exec('e2', 'wf-b', 'FAILED'),
      ]);
      prisma.workflowExecution.count.mockResolvedValue(2);

      const result = await service.listAllForOrg(organizationId, {});

      expect(prisma.workflow.findUnique).not.toHaveBeenCalled();
      expect(prisma.workflowExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workflow: { organizationId } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: 0,
          take: 20,
        }),
      );
      expect(prisma.workflowExecution.count).toHaveBeenCalledWith({
        where: { workflow: { organizationId } },
      });
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe('e1');
      expect(result.items[1].id).toBe('e2');
    });

    it('should return an empty list when the user has no executions', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([]);
      prisma.workflowExecution.count.mockResolvedValue(0);

      const result = await service.listAllForOrg(organizationId, {});

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should combine status filter with the organizationId relation filter', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([]);
      prisma.workflowExecution.count.mockResolvedValue(0);

      await service.listAllForOrg(organizationId, { status: 'FAILED' });

      expect(prisma.workflowExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workflow: { organizationId }, status: 'FAILED' },
        }),
      );
      expect(prisma.workflowExecution.count).toHaveBeenCalledWith({
        where: { workflow: { organizationId }, status: 'FAILED' },
      });
    });

    it('should apply createdAt range filters', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([]);
      prisma.workflowExecution.count.mockResolvedValue(0);

      const from = new Date('2026-04-01T00:00:00Z');
      const to = new Date('2026-04-30T23:59:59Z');
      await service.listAllForOrg(organizationId, { from, to });

      expect(prisma.workflowExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workflow: { organizationId }, createdAt: { gte: from, lte: to } },
        }),
      );
    });

    it('should apply pagination skip/take from page and pageSize', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([]);
      prisma.workflowExecution.count.mockResolvedValue(0);

      await service.listAllForOrg(organizationId, { page: 3, pageSize: 5 });

      expect(prisma.workflowExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 }),
      );
    });

    it('should redact secret-like keys in triggerData on each item', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([
        {
          ...exec('e1', 'wf-a'),
          triggerData: { user: 'ada', password: 'p' },
        },
      ]);
      prisma.workflowExecution.count.mockResolvedValue(1);

      const result = await service.listAllForOrg(organizationId, {});

      expect(result.items[0].triggerData).toEqual({
        user: 'ada',
        password: '[REDACTED]',
      });
    });

    it('should add workflowId equality filter alongside the organizationId relation filter', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([exec('e1', 'wf-a')]);
      prisma.workflowExecution.count.mockResolvedValue(1);

      await service.listAllForOrg(organizationId, { workflowId: 'wf-a' });

      expect(prisma.workflowExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workflow: { organizationId }, workflowId: 'wf-a' },
        }),
      );
      expect(prisma.workflowExecution.count).toHaveBeenCalledWith({
        where: { workflow: { organizationId }, workflowId: 'wf-a' },
      });
    });

    it('should still scope by organizationId when a workflowId not owned by the caller is passed (IDOR)', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([]);
      prisma.workflowExecution.count.mockResolvedValue(0);

      const result = await service.listAllForOrg(organizationId, {
        workflowId: 'wf-of-someone-else',
      });

      expect(prisma.workflowExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workflow: { organizationId }, workflowId: 'wf-of-someone-else' },
        }),
      );
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    describe('cursor pagination', () => {
      it('should emit nextCursor=null when offset page is the last page', async () => {
        prisma.workflowExecution.findMany.mockResolvedValue([
          exec('e1', 'wf-a'),
          exec('e2', 'wf-a'),
        ]);
        prisma.workflowExecution.count.mockResolvedValue(2);

        const result = await service.listAllForOrg(organizationId, { pageSize: 5 });

        expect(result.nextCursor).toBeNull();
      });

      it('should emit a non-null nextCursor when more rows remain on offset path', async () => {
        prisma.workflowExecution.findMany.mockResolvedValue([
          exec('e1', 'wf-a', 'SUCCESS', new Date('2026-04-20T10:00:00Z')),
          exec('e2', 'wf-a', 'SUCCESS', new Date('2026-04-20T09:00:00Z')),
        ]);
        prisma.workflowExecution.count.mockResolvedValue(10);

        const result = await service.listAllForOrg(organizationId, { pageSize: 2 });

        expect(typeof result.nextCursor).toBe('string');
        expect(result.nextCursor).not.toBe('');
      });

      it('should switch to keyset where clause when cursor is provided', async () => {
        const cursorCreatedAt = new Date('2026-04-20T10:00:00.000Z');
        const cursorId = 'cursor-row-id';
        const cursor = Buffer.from(
          JSON.stringify({ createdAt: cursorCreatedAt.toISOString(), id: cursorId }),
          'utf8',
        ).toString('base64url');

        prisma.workflowExecution.findMany.mockResolvedValue([
          exec('e3', 'wf-a', 'SUCCESS', new Date('2026-04-20T09:00:00Z')),
        ]);
        prisma.workflowExecution.count.mockResolvedValue(5);

        await service.listAllForOrg(organizationId, { cursor, pageSize: 10 });

        expect(prisma.workflowExecution.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              AND: expect.arrayContaining([
                expect.objectContaining({ workflow: { organizationId } }),
                {
                  OR: [
                    { createdAt: { lt: cursorCreatedAt } },
                    { AND: [{ createdAt: cursorCreatedAt }, { id: { lt: cursorId } }] },
                  ],
                },
              ]),
            }),
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 11,
          }),
        );
      });

      it('should reject a malformed cursor with BadRequestException', async () => {
        await expect(
          service.listAllForOrg(organizationId, { cursor: 'not-base64!@#' }),
        ).rejects.toThrow();
        expect(prisma.workflowExecution.findMany).not.toHaveBeenCalled();
      });

      it('should drop the peek row and emit nextCursor when more rows remain on cursor path', async () => {
        const cursor = Buffer.from(
          JSON.stringify({
            createdAt: new Date('2026-04-20T10:00:00.000Z').toISOString(),
            id: 'cursor-row-id',
          }),
          'utf8',
        ).toString('base64url');

        const peekRows = [
          exec('e1', 'wf-a', 'SUCCESS', new Date('2026-04-20T09:50:00Z')),
          exec('e2', 'wf-a', 'SUCCESS', new Date('2026-04-20T09:40:00Z')),
          exec('e3', 'wf-a', 'SUCCESS', new Date('2026-04-20T09:30:00Z')),
        ];
        prisma.workflowExecution.findMany.mockResolvedValue(peekRows);
        prisma.workflowExecution.count.mockResolvedValue(50);

        const result = await service.listAllForOrg(organizationId, { cursor, pageSize: 2 });

        expect(result.items).toHaveLength(2);
        expect(result.items.map((i) => i.id)).toEqual(['e1', 'e2']);
        expect(typeof result.nextCursor).toBe('string');
      });

      it('should emit nextCursor=null on the terminal page when no peek row returned', async () => {
        const cursor = Buffer.from(
          JSON.stringify({
            createdAt: new Date('2026-04-20T10:00:00.000Z').toISOString(),
            id: 'cursor-row-id',
          }),
          'utf8',
        ).toString('base64url');

        prisma.workflowExecution.findMany.mockResolvedValue([
          exec('e1', 'wf-a', 'SUCCESS', new Date('2026-04-20T09:50:00Z')),
        ]);
        prisma.workflowExecution.count.mockResolvedValue(50);

        const result = await service.listAllForOrg(organizationId, { cursor, pageSize: 2 });

        expect(result.items).toHaveLength(1);
        expect(result.nextCursor).toBeNull();
      });

      it('should keep organizationId scoping when a cursor is provided (cross-tenant isolation)', async () => {
        const cursor = Buffer.from(
          JSON.stringify({
            createdAt: new Date('2026-04-20T10:00:00.000Z').toISOString(),
            id: 'other-user-execution-id',
          }),
          'utf8',
        ).toString('base64url');

        prisma.workflowExecution.findMany.mockResolvedValue([]);
        prisma.workflowExecution.count.mockResolvedValue(0);

        await service.listAllForOrg(organizationId, { cursor });

        const call = prisma.workflowExecution.findMany.mock.calls[0][0] as {
          where: { AND: Array<Record<string, unknown>> };
        };
        expect(call.where.AND).toEqual(
          expect.arrayContaining([expect.objectContaining({ workflow: { organizationId } })]),
        );
      });

      it('should walk all 25 rows in 3 cursor pages of size 10 with no duplicates', async () => {
        const allRows = Array.from({ length: 25 }, (_, i) => {
          const ts = new Date(2026, 3, 20, 10, 0, 0, 25 - i);
          return exec(`e${String(i + 1).padStart(2, '0')}`, 'wf-a', 'SUCCESS', ts);
        });

        const collected: string[] = [];
        let cursor: string | undefined;

        for (let page = 0; page < 4; page += 1) {
          const start = page * 10;
          const take = page === 0 ? 10 : 11;
          const end = Math.min(start + take, 25);
          const slice = allRows.slice(start, end);
          prisma.workflowExecution.findMany.mockResolvedValueOnce(slice);
          prisma.workflowExecution.count.mockResolvedValueOnce(25);

          const result = await service.listAllForOrg(organizationId, { cursor, pageSize: 10 });
          collected.push(...result.items.map((i) => i.id));
          if (!result.nextCursor) break;
          cursor = result.nextCursor;
        }

        expect(collected).toHaveLength(25);
        expect(new Set(collected).size).toBe(25);
        expect(collected[0]).toBe('e01');
        expect(collected[24]).toBe('e25');
      });
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
      workflow: { organizationId },
    };

    it('should return execution detail for the owner', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue(fullExec);

      const result = await service.findOne(organizationId, executionId);

      expect(prisma.workflowExecution.findUnique).toHaveBeenCalledWith({
        where: { id: executionId },
        include: { workflow: { select: { organizationId: true } } },
      });
      expect(result.id).toBe(executionId);
      expect(result.status).toBe('SUCCESS');
      expect(result.triggerData).toEqual({ foo: 'bar' });
      expect(result.startedAt).toEqual(fullExec.startedAt);
      expect(result.finishedAt).toEqual(fullExec.finishedAt);
    });

    it('should throw NotFoundException when execution does not exist', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue(null);

      await expect(service.findOne(organizationId, executionId)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when execution belongs to another user', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        ...fullExec,
        workflow: { organizationId: otherOrganizationId },
      });

      await expect(service.findOne(organizationId, executionId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should redact secret-like keys in triggerData', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        ...fullExec,
        triggerData: { user: 'ada', password: 'p', authorization: 'Bearer t' },
      });

      const result = await service.findOne(organizationId, executionId);

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
      workflow: { organizationId },
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

      const result = await service.listSteps(organizationId, executionId);

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

      const [s] = await service.listSteps(organizationId, executionId);

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

      await expect(service.listSteps(organizationId, executionId)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.executionStep.findMany).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when execution belongs to another user', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        ...owned,
        workflow: { organizationId: otherOrganizationId },
      });

      await expect(service.listSteps(organizationId, executionId)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.executionStep.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getTriggerSample', () => {
    const triggerNodeId = 'trigger-1';
    const actionNodeId = 'action-1';
    const definition = {
      nodes: [
        {
          id: triggerNodeId,
          type: 'github-issue-opened',
          name: 'Issue opened',
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: actionNodeId,
          type: 'http-request',
          name: 'HTTP',
          position: { x: 0, y: 100 },
          config: {},
        },
      ],
      edges: [],
    } as unknown as WorkflowDefinition;

    it('returns the last real run’s triggerData as the sample when one exists', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, organizationId });
      const capturedAt = new Date('2026-06-01T10:00:00Z');
      prisma.workflowExecution.findFirst.mockResolvedValue({
        id: executionId,
        triggerData: { issue: { title: 'real' } },
        createdAt: capturedAt,
      });

      const result = await service.getTriggerSample(
        organizationId,
        userId,
        workflowId,
        triggerNodeId,
        { definition },
      );

      expect(result).toEqual({
        source: 'last-run',
        sample: { issue: { title: 'real' } },
        executionId,
        capturedAt: capturedAt.toISOString(),
      });
    });

    it('returns source "none" with a null sample when there is no prior real run', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, organizationId });
      prisma.workflowExecution.findFirst.mockResolvedValue(null);

      const result = await service.getTriggerSample(
        organizationId,
        userId,
        workflowId,
        triggerNodeId,
        { definition },
      );

      expect(result).toEqual({ source: 'none', sample: null });
    });

    it('throws NotFoundException when the workflow does not exist', async () => {
      prisma.workflow.findUnique.mockResolvedValue(null);
      await expect(
        service.getTriggerSample(organizationId, userId, workflowId, triggerNodeId, { definition }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when the workflow belongs to another workspace', async () => {
      prisma.workflow.findUnique.mockResolvedValue({
        id: workflowId,
        organizationId: otherOrganizationId,
      });
      await expect(
        service.getTriggerSample(organizationId, userId, workflowId, triggerNodeId, { definition }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when the node is not in the definition', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, organizationId });
      await expect(
        service.getTriggerSample(organizationId, userId, workflowId, 'missing-node', {
          definition,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when the node is not a trigger', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ id: workflowId, organizationId });
      await expect(
        service.getTriggerSample(organizationId, userId, workflowId, actionNodeId, { definition }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
