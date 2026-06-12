import { BadRequestException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from './audit-log.service';
import { encodeAuditCursor } from './cursor';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let prisma: {
    auditLog: {
      create: jest.Mock;
      findMany: jest.Mock;
    };
    user: { findMany: jest.Mock };
  };

  const userId = 'user-uuid-1';

  beforeEach(async () => {
    prisma = {
      auditLog: { create: jest.fn(), findMany: jest.fn() },
      user: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditLogService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
    jest.clearAllMocks();
  });

  describe('log', () => {
    it('should persist an audit row with userId, action, resource, and resourceId', async () => {
      prisma.auditLog.create.mockResolvedValue({});

      await service.log({
        userId,
        action: 'workflow.create',
        resource: 'workflow',
        resourceId: 'wf-1',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId,
          action: 'workflow.create',
          resource: 'workflow',
          resourceId: 'wf-1',
          metadata: undefined,
        },
      });
    });

    it('should accept optional metadata and persist it as JSON', async () => {
      prisma.auditLog.create.mockResolvedValue({});

      await service.log({
        userId,
        action: 'execution.trigger',
        resource: 'workflow',
        resourceId: 'wf-1',
        metadata: { executionId: 'exec-1', triggerType: 'manual' },
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: { executionId: 'exec-1', triggerType: 'manual' },
        }),
      });
    });

    it('should never throw when Prisma fails — audit must not break the caller', async () => {
      prisma.auditLog.create.mockRejectedValue(new Error('db is down'));

      await expect(
        service.log({
          userId,
          action: 'workflow.delete',
          resource: 'workflow',
          resourceId: 'wf-1',
        }),
      ).resolves.toBeUndefined();
    });

    it('should reject metadata that may contain secret values by stripping known sensitive keys', async () => {
      prisma.auditLog.create.mockResolvedValue({});

      await service.log({
        userId,
        action: 'secret.update',
        resource: 'secret',
        resourceId: 'sec-1',
        metadata: { name: 'DB_PASSWORD', value: 'should-not-leak', password: 'nope' },
      });

      const call = prisma.auditLog.create.mock.calls[0][0] as {
        data: { metadata: Record<string, unknown> };
      };
      expect(call.data.metadata).toEqual({ name: 'DB_PASSWORD' });
      expect(call.data.metadata).not.toHaveProperty('value');
      expect(call.data.metadata).not.toHaveProperty('password');
    });

    it('should strip sensitive keys nested anywhere in the metadata tree', async () => {
      prisma.auditLog.create.mockResolvedValue({});

      await service.log({
        userId,
        action: 'connection.update',
        resource: 'connection',
        resourceId: 'conn-1',
        metadata: {
          provider: 'google',
          connection: { config: { accessToken: 'leak-me' }, name: 'My Google' },
          tags: [{ label: 'prod', secret: 'also-leak' }],
        },
      });

      const call = prisma.auditLog.create.mock.calls[0][0] as {
        data: { metadata: Record<string, unknown> };
      };
      expect(call.data.metadata).toEqual({
        provider: 'google',
        connection: { name: 'My Google' }, // the whole `config` subtree is dropped
        tags: [{ label: 'prod' }], // `secret` dropped inside the array element
      });
    });
  });

  describe('logSync', () => {
    it('should await the underlying create so the write is durable before resolving', async () => {
      let resolveCreate: (value: unknown) => void = () => undefined;
      const createPromise = new Promise((resolve) => {
        resolveCreate = resolve;
      });
      prisma.auditLog.create.mockReturnValue(createPromise);

      let settled = false;
      const logPromise = service
        .logSync({
          userId,
          action: 'auth.login',
          resource: 'user',
          resourceId: userId,
        })
        .then(() => {
          settled = true;
        });

      // The DB write has not resolved yet, so logSync must still be pending —
      // proving it actually awaits the insert (unlike fire-and-forget log()).
      await Promise.resolve();
      expect(settled).toBe(false);

      resolveCreate({});
      await logPromise;
      expect(settled).toBe(true);
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId,
          action: 'auth.login',
          resource: 'user',
          resourceId: userId,
          metadata: undefined,
        },
      });
    });

    it('should propagate (rethrow) a Prisma failure so the security event cannot be silently dropped', async () => {
      const dbError = new Error('db is down');
      prisma.auditLog.create.mockRejectedValue(dbError);

      await expect(
        service.logSync({
          userId,
          action: 'account.delete',
          resource: 'user',
          resourceId: userId,
        }),
      ).rejects.toBe(dbError);
    });

    it('should strip sensitive metadata keys before persisting', async () => {
      prisma.auditLog.create.mockResolvedValue({});

      await service.logSync({
        userId,
        action: 'auth.password-change',
        resource: 'user',
        resourceId: userId,
        metadata: { ip: '1.2.3.4', password: 'should-not-leak' },
      });

      const call = prisma.auditLog.create.mock.calls[0][0] as {
        data: { metadata: Record<string, unknown> };
      };
      expect(call.data.metadata).toEqual({ ip: '1.2.3.4' });
      expect(call.data.metadata).not.toHaveProperty('password');
    });

    it('should write through a provided transaction client so the audit row commits atomically with the mutation', async () => {
      const tx = { auditLog: { create: jest.fn().mockResolvedValue({}) } };

      await service.logSync(
        {
          userId,
          action: 'organization.delete',
          resource: 'organization',
          resourceId: 'org-1',
        },
        tx as never,
      );

      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId,
          action: 'organization.delete',
          resource: 'organization',
          resourceId: 'org-1',
          metadata: undefined,
        },
      });
      // The service-level prisma client must NOT be used when a tx client is given.
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('findMany', () => {
    const baseRow = (
      overrides: Partial<Record<string, unknown>> = {},
    ): Record<string, unknown> => ({
      id: '11111111-1111-4111-8111-111111111111',
      userId: 'admin-uuid',
      action: 'env-var.create',
      resource: 'env-var',
      resourceId: 'ev-1',
      metadata: { key: 'API_BASE_URL' },
      createdAt: new Date('2026-05-08T12:00:00.000Z'),
      user: { email: 'admin@example.com' },
      ...overrides,
    });

    it('should return rows newest-first with no nextCursor when fewer than limit+1 rows exist', async () => {
      prisma.auditLog.findMany.mockResolvedValue([
        baseRow(),
        baseRow({ id: '22222222-2222-4222-8222-222222222222' }),
      ]);

      const result = await service.findMany({ filters: {}, limit: 50 });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 51,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          include: { user: { select: { email: true } } },
        }),
      );
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toMatchObject({
        id: '11111111-1111-4111-8111-111111111111',
        userEmail: 'admin@example.com',
      });
      expect(result.nextCursor).toBeNull();
    });

    it('should narrow results when userId filter is provided', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);

      await service.findMany({
        filters: { userId: '99999999-9999-4999-8999-999999999999' },
        limit: 10,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: '99999999-9999-4999-8999-999999999999' }),
        }),
      );
    });

    it('should narrow results when action filter is provided', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      await service.findMany({ filters: { action: 'env-var.create' }, limit: 10 });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ action: 'env-var.create' }),
        }),
      );
    });

    it('should narrow results when resource filter is provided', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      await service.findMany({ filters: { resource: 'workflow' }, limit: 10 });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ resource: 'workflow' }),
        }),
      );
    });

    it('should apply createdAt range when from and to are provided', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);

      await service.findMany({
        filters: { from: '2026-05-01T00:00:00.000Z', to: '2026-05-08T00:00:00.000Z' },
        limit: 10,
      });

      const call = prisma.auditLog.findMany.mock.calls[0][0] as {
        where: { createdAt?: { gte?: Date; lte?: Date } };
      };
      expect(call.where.createdAt?.gte).toEqual(new Date('2026-05-01T00:00:00.000Z'));
      expect(call.where.createdAt?.lte).toEqual(new Date('2026-05-08T00:00:00.000Z'));
    });

    it('should reject when from is after to', async () => {
      await expect(
        service.findMany({
          filters: { from: '2026-06-01T00:00:00Z', to: '2026-05-01T00:00:00Z' },
          limit: 10,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
    });

    it('should encode a nextCursor when overfetch indicates more rows exist', async () => {
      const rows = Array.from({ length: 6 }, (_, i) =>
        baseRow({
          id: `00000000-0000-4000-8000-00000000000${i}`,
          createdAt: new Date(`2026-05-08T0${5 - i}:00:00.000Z`),
        }),
      );
      prisma.auditLog.findMany.mockResolvedValue(rows);

      const result = await service.findMany({ filters: {}, limit: 5 });

      expect(result.items).toHaveLength(5);
      expect(result.nextCursor).toEqual(expect.any(String));
      expect(result.nextCursor!.length).toBeGreaterThan(0);
    });

    it('should decode a cursor and apply it to the where clause', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      const cursor = encodeAuditCursor({
        createdAt: new Date('2026-05-08T12:00:00.000Z').toISOString(),
        id: '11111111-1111-4111-8111-111111111111',
      });

      await service.findMany({ filters: {}, cursor, limit: 10 });

      const call = prisma.auditLog.findMany.mock.calls[0][0] as {
        where: { OR?: unknown[] };
      };
      expect(call.where.OR).toBeDefined();
      expect(call.where.OR).toEqual([
        { createdAt: { lt: new Date('2026-05-08T12:00:00.000Z') } },
        {
          createdAt: new Date('2026-05-08T12:00:00.000Z'),
          id: { lt: '11111111-1111-4111-8111-111111111111' },
        },
      ]);
    });

    it('should reject a malformed cursor with BadRequestException', async () => {
      await expect(
        service.findMany({ filters: {}, cursor: 'not-a-valid-cursor!!', limit: 10 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
    });

    it('should cap limit at MAX_PAGE_SIZE when too large', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);

      await service.findMany({ filters: {}, limit: 9999 });

      const call = prisma.auditLog.findMany.mock.calls[0][0] as { take: number };
      expect(call.take).toBe(101);
    });
  });

  describe('findAllForExport', () => {
    it('should respect filters and hard-cap rows returned', async () => {
      const rows = Array.from({ length: 10 }, (_, i) => ({
        id: `00000000-0000-4000-8000-00000000000${i}`,
        userId: 'admin-uuid',
        action: 'env-var.create',
        resource: 'env-var',
        resourceId: `ev-${i}`,
        metadata: null,
        createdAt: new Date('2026-05-08T12:00:00.000Z'),
        user: { email: 'admin@example.com' },
      }));
      prisma.auditLog.findMany.mockResolvedValue(rows);

      const result = await service.findAllForExport({ filters: { action: 'env-var.create' } });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ action: 'env-var.create' }),
          take: expect.any(Number),
        }),
      );
      expect(result.length).toBe(10);
    });

    it('should reject when from > to', async () => {
      await expect(
        service.findAllForExport({
          filters: { from: '2026-06-01T00:00:00Z', to: '2026-05-01T00:00:00Z' },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('listFilterValues', () => {
    it('should return distinct users, actions, and resources', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'u1', email: 'a@x.com' },
        { id: 'u2', email: 'b@x.com' },
      ]);
      prisma.auditLog.findMany
        .mockResolvedValueOnce([{ action: 'env-var.create' }, { action: 'env-var.update' }])
        .mockResolvedValueOnce([{ resource: 'env-var' }, { resource: 'workflow' }]);

      const result = await service.listFilterValues();

      expect(result.users).toEqual([
        { id: 'u1', email: 'a@x.com' },
        { id: 'u2', email: 'b@x.com' },
      ]);
      expect(result.actions).toEqual(['env-var.create', 'env-var.update']);
      expect(result.resources).toEqual(['env-var', 'workflow']);
    });

    it('should ask Prisma for distinct values', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.auditLog.findMany.mockResolvedValue([]);

      await service.listFilterValues();

      const actionCall = prisma.auditLog.findMany.mock.calls[0][0] as {
        distinct?: unknown;
        select?: { action?: boolean };
      };
      expect(actionCall.distinct).toEqual(['action']);
      expect(actionCall.select).toEqual({ action: true });
    });
  });
});
