import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { WorkflowsService } from './workflows.service';

describe('WorkflowsService', () => {
  let service: WorkflowsService;
  let audit: { log: jest.Mock };
  let prisma: {
    workflow: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  const userId = 'user-uuid-1';
  const otherUserId = 'user-uuid-2';
  const workflowId = 'workflow-uuid-1';

  const validDefinition = {
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

  const persisted = {
    id: workflowId,
    name: 'Demo',
    description: null,
    definition: validDefinition,
    isActive: false,
    version: 1,
    createdAt: new Date('2026-04-17T00:00:00Z'),
    updatedAt: new Date('2026-04-17T00:00:00Z'),
    _count: { executions: 0 },
    documentation: null,
  };

  const { _count: _persistedCount, documentation: _persistedDoc, ...persistedFields } = persisted;
  const persistedResponse = {
    ...persistedFields,
    executionCount: _persistedCount.executions,
    documentation: _persistedDoc,
  };

  beforeEach(async () => {
    prisma = {
      workflow: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: audit },
      ],
    }).compile();

    service = module.get<WorkflowsService>(WorkflowsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    const dto = { name: 'Demo', definition: validDefinition };

    it('should persist with userId from the caller and return the row', async () => {
      prisma.workflow.create.mockResolvedValue(persisted);

      const result = await service.create(userId, dto);

      expect(prisma.workflow.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            userId,
            name: 'Demo',
            description: null,
            definition: validDefinition,
          },
        }),
      );
      expect(result).toEqual(persistedResponse);
    });

    it('should accept an optional description', async () => {
      prisma.workflow.create.mockResolvedValue(persisted);

      await service.create(userId, { ...dto, description: 'Notes' });

      expect(prisma.workflow.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ description: 'Notes' }),
        }),
      );
    });

    it('should exclude userId from the selected/returned columns', async () => {
      prisma.workflow.create.mockResolvedValue(persisted);

      await service.create(userId, dto);

      const call = prisma.workflow.create.mock.calls[0][0] as { select: Record<string, boolean> };
      expect(call.select).toBeDefined();
      expect(call.select.userId).toBeFalsy();
    });

    it('should record an audit log entry with action "workflow.create"', async () => {
      prisma.workflow.create.mockResolvedValue(persisted);

      await service.create(userId, dto);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'workflow.create',
          resource: 'workflow',
          resourceId: workflowId,
        }),
      );
    });
  });

  describe('list', () => {
    it('should query Prisma scoped to the caller userId only', async () => {
      prisma.workflow.findMany.mockResolvedValue([]);

      await service.list(userId);

      expect(prisma.workflow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('should return the rows mapped to response DTOs', async () => {
      prisma.workflow.findMany.mockResolvedValue([persisted]);

      const result = await service.list(userId);

      expect(result).toEqual([persistedResponse]);
    });

    it('should request the execution count via Prisma _count', async () => {
      prisma.workflow.findMany.mockResolvedValue([]);

      await service.list(userId);

      const call = prisma.workflow.findMany.mock.calls[0][0] as {
        select: Record<string, unknown>;
      };
      expect(call.select._count).toEqual({ select: { executions: true } });
    });

    it('should map _count.executions to executionCount', async () => {
      prisma.workflow.findMany.mockResolvedValue([{ ...persisted, _count: { executions: 7 } }]);

      const [row] = await service.list(userId);

      expect(row.executionCount).toBe(7);
      expect(row).not.toHaveProperty('_count');
    });

    it('should exclude userId from the response select', async () => {
      prisma.workflow.findMany.mockResolvedValue([]);

      await service.list(userId);

      const call = prisma.workflow.findMany.mock.calls[0][0] as {
        select: Record<string, boolean>;
      };
      expect(call.select).toBeDefined();
      expect(call.select.userId).toBeFalsy();
    });

    it('should request the documentation relation with updatedAt and version', async () => {
      prisma.workflow.findMany.mockResolvedValue([]);

      await service.list(userId);

      const call = prisma.workflow.findMany.mock.calls[0][0] as {
        select: Record<string, unknown>;
      };
      expect(call.select.documentation).toEqual({
        select: { updatedAt: true, version: true },
      });
    });

    it('should map documentation { updatedAt, version } to { generatedAt, version }', async () => {
      const docUpdated = new Date('2026-05-01T10:00:00Z');
      prisma.workflow.findMany.mockResolvedValue([
        {
          ...persisted,
          documentation: { updatedAt: docUpdated, version: 3 },
        },
      ]);

      const [row] = await service.list(userId);

      expect(row.documentation).toEqual({ generatedAt: docUpdated, version: 3 });
    });

    it('should expose documentation as null when none exists', async () => {
      prisma.workflow.findMany.mockResolvedValue([{ ...persisted, documentation: null }]);

      const [row] = await service.list(userId);

      expect(row.documentation).toBeNull();
    });
  });

  describe('findOne', () => {
    it('should return the workflow when the caller owns it', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ ...persisted, userId });

      const result = await service.findOne(userId, workflowId);

      expect(prisma.workflow.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: workflowId } }),
      );
      expect(result).toEqual(expect.objectContaining({ id: workflowId }));
    });

    it('should throw NotFoundException when the row does not exist', async () => {
      prisma.workflow.findUnique.mockResolvedValue(null);

      await expect(service.findOne(userId, workflowId)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when the row belongs to another user', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ ...persisted, userId: otherUserId });

      await expect(service.findOne(userId, workflowId)).rejects.toThrow(ForbiddenException);
    });

    it('should not leak userId in the returned payload', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ ...persisted, userId });

      const result = await service.findOne(userId, workflowId);

      expect(result).not.toHaveProperty('userId');
    });

    it('should include documentation metadata when present', async () => {
      const docUpdated = new Date('2026-05-02T08:30:00Z');
      prisma.workflow.findUnique.mockResolvedValue({
        ...persisted,
        userId,
        documentation: { updatedAt: docUpdated, version: 2 },
      });

      const result = await service.findOne(userId, workflowId);

      expect(result.documentation).toEqual({ generatedAt: docUpdated, version: 2 });
    });

    it('should expose documentation as null when none exists', async () => {
      prisma.workflow.findUnique.mockResolvedValue({
        ...persisted,
        userId,
        documentation: null,
      });

      const result = await service.findOne(userId, workflowId);

      expect(result.documentation).toBeNull();
    });
  });

  describe('update', () => {
    beforeEach(() => {
      prisma.workflow.findUnique.mockResolvedValue({ ...persisted, userId });
      prisma.workflow.update.mockResolvedValue({ ...persisted, version: 2 });
    });

    it('should increment version by 1 and apply partial fields', async () => {
      await service.update(userId, workflowId, { name: 'Renamed' });

      expect(prisma.workflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: workflowId },
          data: {
            name: 'Renamed',
            version: { increment: 1 },
          },
        }),
      );
    });

    it('should accept an updated definition and persist it verbatim', async () => {
      const newDef = {
        ...validDefinition,
        nodes: [...validDefinition.nodes, { ...validDefinition.nodes[0], id: 'n2' }],
      };

      await service.update(userId, workflowId, { definition: newDef });

      expect(prisma.workflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ definition: newDef }),
        }),
      );
    });

    it('should not touch the definition column when definition is absent', async () => {
      await service.update(userId, workflowId, { isActive: true });

      expect(prisma.workflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: true, version: { increment: 1 } }),
        }),
      );
    });

    it('should throw NotFoundException when the row does not exist', async () => {
      prisma.workflow.findUnique.mockResolvedValue(null);

      await expect(service.update(userId, workflowId, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.workflow.update).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when the row belongs to another user', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ ...persisted, userId: otherUserId });

      await expect(service.update(userId, workflowId, { name: 'X' })).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.workflow.update).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException with an empty body and not touch Prisma', async () => {
      await expect(service.update(userId, workflowId, {})).rejects.toThrow(BadRequestException);

      expect(prisma.workflow.findUnique).not.toHaveBeenCalled();
      expect(prisma.workflow.update).not.toHaveBeenCalled();
    });

    it('should accept description: null to clear it', async () => {
      await service.update(userId, workflowId, { description: null });

      expect(prisma.workflow.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ description: null }),
        }),
      );
    });

    it('should return the updated row without userId', async () => {
      const result = await service.update(userId, workflowId, { name: 'Renamed' });

      expect(result).not.toHaveProperty('userId');
      expect(result.version).toBe(2);
    });

    it('should record an audit log entry with action "workflow.update"', async () => {
      await service.update(userId, workflowId, { name: 'Renamed' });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'workflow.update',
          resource: 'workflow',
          resourceId: workflowId,
        }),
      );
    });
  });

  describe('remove', () => {
    it('should delete when the caller owns the row', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ ...persisted, userId });
      prisma.workflow.deleteMany.mockResolvedValue({ count: 1 });

      await service.remove(userId, workflowId);

      expect(prisma.workflow.deleteMany).toHaveBeenCalledWith({
        where: { id: workflowId, userId },
      });
    });

    it('should record an audit log entry with action "workflow.delete"', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ ...persisted, userId });
      prisma.workflow.deleteMany.mockResolvedValue({ count: 1 });

      await service.remove(userId, workflowId);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'workflow.delete',
          resource: 'workflow',
          resourceId: workflowId,
        }),
      );
    });

    it('should throw NotFoundException when the row does not exist', async () => {
      prisma.workflow.findUnique.mockResolvedValue(null);

      await expect(service.remove(userId, workflowId)).rejects.toThrow(NotFoundException);

      expect(prisma.workflow.deleteMany).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when the row belongs to another user', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ ...persisted, userId: otherUserId });

      await expect(service.remove(userId, workflowId)).rejects.toThrow(ForbiddenException);

      expect(prisma.workflow.deleteMany).not.toHaveBeenCalled();
    });
  });
});
