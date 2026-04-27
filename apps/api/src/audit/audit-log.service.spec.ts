import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from './audit-log.service';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let prisma: { auditLog: { create: jest.Mock } };

  const userId = 'user-uuid-1';

  beforeEach(async () => {
    prisma = { auditLog: { create: jest.fn() } };

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
  });
});
