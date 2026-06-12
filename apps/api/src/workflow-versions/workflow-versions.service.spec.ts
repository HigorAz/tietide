import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { WorkflowVersionsService } from './workflow-versions.service';
import { encodeVersionCursor } from './cursor';

describe('WorkflowVersionsService', () => {
  let service: WorkflowVersionsService;
  let audit: { log: jest.Mock };
  let prisma: {
    workflow: { findUnique: jest.Mock };
    workflowVersion: { findMany: jest.Mock; findUnique: jest.Mock };
  };

  // Authorization is scoped by the active organization, not the original author.
  const organizationId = 'org-uuid-1';
  const otherOrganizationId = 'org-uuid-2';
  // The acting user — used only for the restore audit actor, never for authz.
  const userId = 'user-uuid-1';
  const workflowId = 'workflow-uuid-1';

  const baseDefinition = {
    nodes: [
      { id: 'n1', type: 'manual-trigger', name: 'Start', position: { x: 0, y: 0 }, config: {} },
    ],
    edges: [],
  };

  const versionRow = (version: number, createdAt: string) => ({
    id: `version-${version}`,
    workflowId,
    version,
    definition: baseDefinition,
    message: null,
    createdAt: new Date(createdAt),
    createdById: userId,
    createdBy: { id: userId, email: 'user@example.com' },
  });

  beforeEach(async () => {
    prisma = {
      workflow: { findUnique: jest.fn() },
      workflowVersion: { findMany: jest.fn(), findUnique: jest.fn() },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowVersionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: audit },
      ],
    }).compile();

    service = module.get<WorkflowVersionsService>(WorkflowVersionsService);
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('should return versions in DESC order with no cursor when fewer than pageSize+1 rows', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ organizationId });
      prisma.workflowVersion.findMany.mockResolvedValue([
        versionRow(3, '2026-05-06T10:00:00Z'),
        versionRow(2, '2026-05-06T09:00:00Z'),
        versionRow(1, '2026-05-06T08:00:00Z'),
      ]);

      const result = await service.list(organizationId, workflowId, {});

      expect(prisma.workflowVersion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workflowId },
          orderBy: [{ version: 'desc' }],
        }),
      );
      expect(result.items.map((v) => v.version)).toEqual([3, 2, 1]);
      expect(result.nextCursor).toBeNull();
    });

    it('should authorize against the workflow organizationId, not its author', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ organizationId });
      prisma.workflowVersion.findMany.mockResolvedValue([]);

      await service.list(organizationId, workflowId, {});

      expect(prisma.workflow.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: workflowId },
          select: { organizationId: true },
        }),
      );
    });

    it('should allow a co-member of the owning org even if they did not author the workflow', async () => {
      // Workflow owned by the active org; the original author is irrelevant.
      prisma.workflow.findUnique.mockResolvedValue({ organizationId });
      prisma.workflowVersion.findMany.mockResolvedValue([versionRow(1, '2026-05-06T08:00:00Z')]);

      const result = await service.list(organizationId, workflowId, {});

      expect(result.items.map((v) => v.version)).toEqual([1]);
    });

    it('should return a nextCursor when there are more rows than pageSize', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ organizationId });
      const rows = Array.from({ length: 21 }, (_, i) =>
        versionRow(21 - i, `2026-05-${String(6 - (i % 6)).padStart(2, '0')}T10:00:00Z`),
      );
      prisma.workflowVersion.findMany.mockResolvedValue(rows);

      const result = await service.list(organizationId, workflowId, {});

      expect(result.items).toHaveLength(20);
      expect(result.nextCursor).not.toBeNull();
    });

    it('should respect cursor and return the next page in DESC order', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ organizationId });
      const cursor = encodeVersionCursor({ version: 5 });
      prisma.workflowVersion.findMany.mockResolvedValue([
        versionRow(4, '2026-05-06T08:00:00Z'),
        versionRow(3, '2026-05-06T07:00:00Z'),
      ]);

      await service.list(organizationId, workflowId, { cursor });

      expect(prisma.workflowVersion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workflowId, version: { lt: 5 } },
        }),
      );
    });

    it('should reject an invalid cursor with BadRequestException', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ organizationId });

      await expect(
        service.list(organizationId, workflowId, { cursor: '!!notvalid!!' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject limit > 100 with BadRequestException', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ organizationId });

      await expect(service.list(organizationId, workflowId, { limit: 999 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when workflow does not exist', async () => {
      prisma.workflow.findUnique.mockResolvedValue(null);

      await expect(service.list(organizationId, workflowId, {})).rejects.toThrow(NotFoundException);
      expect(prisma.workflowVersion.findMany).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when workflow belongs to another org (IDOR)', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ organizationId: otherOrganizationId });

      await expect(service.list(organizationId, workflowId, {})).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.workflowVersion.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getOne', () => {
    it('should return the requested version when the active org owns the workflow', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ organizationId });
      prisma.workflowVersion.findUnique.mockResolvedValue(versionRow(2, '2026-05-06T09:00:00Z'));

      const result = await service.getOne(organizationId, workflowId, 2);

      expect(prisma.workflowVersion.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workflowId_version: { workflowId, version: 2 } },
        }),
      );
      expect(result.version).toBe(2);
      expect(result.definition).toEqual(baseDefinition);
    });

    it('should throw NotFoundException when the version does not exist', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ organizationId });
      prisma.workflowVersion.findUnique.mockResolvedValue(null);

      await expect(service.getOne(organizationId, workflowId, 99)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when the workflow belongs to another org (IDOR)', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ organizationId: otherOrganizationId });

      await expect(service.getOne(organizationId, workflowId, 1)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.workflowVersion.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('should return the version definition without mutating any workflow row', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ organizationId });
      prisma.workflowVersion.findUnique.mockResolvedValue(versionRow(2, '2026-05-06T09:00:00Z'));

      const result = await service.restore(organizationId, userId, workflowId, 2);

      expect(result).toEqual({ version: 2, definition: baseDefinition });
    });

    it('should record an audit log entry with the acting user as actor', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ organizationId });
      prisma.workflowVersion.findUnique.mockResolvedValue(versionRow(2, '2026-05-06T09:00:00Z'));

      await service.restore(organizationId, userId, workflowId, 2);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'workflow.version.restore',
          resource: 'workflow',
          resourceId: workflowId,
          metadata: { version: 2 },
        }),
      );
    });

    it('should scope the restore audit entry to the owning organization', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ organizationId });
      prisma.workflowVersion.findUnique.mockResolvedValue(versionRow(2, '2026-05-06T09:00:00Z'));

      await service.restore(organizationId, userId, workflowId, 2);

      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ organizationId }));
    });

    it('should throw NotFoundException when the version does not exist', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ organizationId });
      prisma.workflowVersion.findUnique.mockResolvedValue(null);

      await expect(service.restore(organizationId, userId, workflowId, 99)).rejects.toThrow(
        NotFoundException,
      );
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when the workflow belongs to another org (IDOR)', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ organizationId: otherOrganizationId });

      await expect(service.restore(organizationId, userId, workflowId, 1)).rejects.toThrow(
        ForbiddenException,
      );
      expect(audit.log).not.toHaveBeenCalled();
    });
  });
});
