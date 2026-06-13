import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService, AiServiceUnavailableError } from '../ai/ai.service';
import { WorkflowDocumentationService } from './workflow-documentation.service';

describe('WorkflowDocumentationService', () => {
  let service: WorkflowDocumentationService;
  let prisma: {
    workflow: { findUnique: jest.Mock };
    workflowDocumentation: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
  };
  let ai: { generateDocs: jest.Mock };

  const orgId = 'org-uuid-1';
  const otherOrgId = 'org-uuid-2';
  const workflowId = '550e8400-e29b-41d4-a716-446655440000';
  const definition = {
    nodes: [
      { id: 'n1', type: 'manual-trigger', name: 'Start', position: { x: 0, y: 0 }, config: {} },
    ],
    edges: [],
  };

  const persistedWorkflow = {
    id: workflowId,
    organizationId: orgId,
    name: 'Demo',
    definition,
    version: 3,
  };

  const generatedSections = {
    overview: 'ov',
    prerequisites: 'pre',
    trigger: 'trig',
    walkthrough: 'wt',
    dataFlow: 'flow',
    decisions: 'dec',
    errorHandling: 'err',
  };

  const cachedRow = {
    id: 'doc-uuid-1',
    workflowId,
    version: 3,
    documentation: '# Demo\nCached text',
    sections: generatedSections,
    model: 'llama3.1:8b',
    createdAt: new Date('2026-04-26T00:00:00Z'),
    updatedAt: new Date('2026-04-26T00:00:00Z'),
  };

  const aiResult = {
    documentation: '# Demo\nFresh text',
    sections: generatedSections,
    model: 'llama3.1:8b',
  };

  beforeEach(async () => {
    prisma = {
      workflow: { findUnique: jest.fn() },
      workflowDocumentation: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };
    ai = { generateDocs: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowDocumentationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: ai },
      ],
    }).compile();

    service = module.get(WorkflowDocumentationService);
  });

  describe('findExisting', () => {
    it('should return the existing documentation row without calling the AI service', async () => {
      prisma.workflow.findUnique.mockResolvedValue(persistedWorkflow);
      prisma.workflowDocumentation.findUnique.mockResolvedValue(cachedRow);

      const result = await service.findExisting(orgId, workflowId);

      expect(ai.generateDocs).not.toHaveBeenCalled();
      expect(prisma.workflowDocumentation.upsert).not.toHaveBeenCalled();
      expect(result).toEqual({
        workflowId,
        version: 3,
        documentation: '# Demo\nCached text',
        sections: generatedSections,
        model: 'llama3.1:8b',
        generatedAt: cachedRow.updatedAt,
      });
      expect(result).not.toHaveProperty('cached');
    });

    it('should return null when no documentation row exists for the workflow', async () => {
      prisma.workflow.findUnique.mockResolvedValue(persistedWorkflow);
      prisma.workflowDocumentation.findUnique.mockResolvedValue(null);

      const result = await service.findExisting(orgId, workflowId);

      expect(result).toBeNull();
      expect(ai.generateDocs).not.toHaveBeenCalled();
    });

    it('should return the row even when the cached version is stale', async () => {
      prisma.workflow.findUnique.mockResolvedValue(persistedWorkflow);
      prisma.workflowDocumentation.findUnique.mockResolvedValue({ ...cachedRow, version: 2 });

      const result = await service.findExisting(orgId, workflowId);

      expect(result).not.toBeNull();
      expect(result?.version).toBe(2);
      expect(ai.generateDocs).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when the workflow does not exist', async () => {
      prisma.workflow.findUnique.mockResolvedValue(null);

      await expect(service.findExisting(orgId, workflowId)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when the active org does not own the workflow', async () => {
      prisma.workflow.findUnique.mockResolvedValue({
        ...persistedWorkflow,
        organizationId: otherOrgId,
      });

      await expect(service.findExisting(orgId, workflowId)).rejects.toThrow(ForbiddenException);
      expect(ai.generateDocs).not.toHaveBeenCalled();
    });

    it('should allow a co-member of the owning org (authorizes by org, not author)', async () => {
      // Workflow is owned by orgId; the caller's active org is orgId even though
      // they are not the original author — co-members must not be 403'd (W5.5).
      prisma.workflow.findUnique.mockResolvedValue(persistedWorkflow);
      prisma.workflowDocumentation.findUnique.mockResolvedValue(cachedRow);

      const result = await service.findExisting(orgId, workflowId);

      expect(result).not.toBeNull();
      expect(prisma.workflow.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: workflowId },
          select: expect.objectContaining({ organizationId: true }),
        }),
      );
    });
  });

  describe('update', () => {
    it('overwrites the documentation, preserves sections, and marks model manual', async () => {
      prisma.workflow.findUnique.mockResolvedValue(persistedWorkflow);
      prisma.workflowDocumentation.findUnique.mockResolvedValue({ sections: generatedSections });
      prisma.workflowDocumentation.upsert.mockResolvedValue({
        ...cachedRow,
        documentation: '# Edited by hand',
        model: 'manual',
      });

      const result = await service.update(orgId, workflowId, '# Edited by hand');

      expect(ai.generateDocs).not.toHaveBeenCalled();
      expect(prisma.workflowDocumentation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workflowId },
          create: expect.objectContaining({
            workflowId,
            documentation: '# Edited by hand',
            sections: generatedSections,
            model: 'manual',
          }),
          update: expect.objectContaining({ documentation: '# Edited by hand', model: 'manual' }),
        }),
      );
      expect(result).toMatchObject({ documentation: '# Edited by hand', model: 'manual' });
    });

    it('upserts with empty sections when no documentation row exists yet', async () => {
      prisma.workflow.findUnique.mockResolvedValue(persistedWorkflow);
      prisma.workflowDocumentation.findUnique.mockResolvedValue(null);
      prisma.workflowDocumentation.upsert.mockResolvedValue({
        ...cachedRow,
        documentation: '# First',
        model: 'manual',
      });

      await service.update(orgId, workflowId, '# First');

      expect(prisma.workflowDocumentation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ sections: {} }) }),
      );
    });

    it('throws NotFoundException when the workflow does not exist', async () => {
      prisma.workflow.findUnique.mockResolvedValue(null);

      await expect(service.update(orgId, workflowId, '# x')).rejects.toThrow(NotFoundException);
      expect(prisma.workflowDocumentation.upsert).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the active org does not own the workflow', async () => {
      prisma.workflow.findUnique.mockResolvedValue({
        ...persistedWorkflow,
        organizationId: otherOrgId,
      });

      await expect(service.update(orgId, workflowId, '# x')).rejects.toThrow(ForbiddenException);
      expect(prisma.workflowDocumentation.upsert).not.toHaveBeenCalled();
    });
  });

  describe('startRegeneration', () => {
    // Let the detached background promise (ai.generateDocs → upsert → finally) settle.
    const flush = async (): Promise<void> => {
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
    };

    it('should return pending immediately and run generation in the background', async () => {
      prisma.workflow.findUnique.mockResolvedValue(persistedWorkflow);
      ai.generateDocs.mockResolvedValue(aiResult);
      prisma.workflowDocumentation.upsert.mockResolvedValue({
        ...cachedRow,
        documentation: aiResult.documentation,
      });

      const result = await service.startRegeneration(orgId, workflowId);

      expect(result).toEqual({ workflowId, status: 'pending' });

      await flush();
      expect(ai.generateDocs).toHaveBeenCalledTimes(1);
      expect(ai.generateDocs).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId,
          workflowName: 'Demo',
          definition,
          facts: expect.objectContaining({ nodes: expect.any(Array) }),
        }),
      );
      expect(prisma.workflowDocumentation.upsert).toHaveBeenCalledTimes(1);
    });

    it('should not start a second generation while one is in flight for the workflow', async () => {
      prisma.workflow.findUnique.mockResolvedValue(persistedWorkflow);
      let resolveGen: (value: unknown) => void = () => {};
      ai.generateDocs.mockReturnValue(
        new Promise((resolve) => {
          resolveGen = resolve;
        }),
      );
      prisma.workflowDocumentation.upsert.mockResolvedValue(cachedRow);

      await service.startRegeneration(orgId, workflowId);
      await service.startRegeneration(orgId, workflowId);

      expect(ai.generateDocs).toHaveBeenCalledTimes(1);

      resolveGen(aiResult);
      await flush();
    });

    it('should throw NotFoundException (and not generate) when the workflow does not exist', async () => {
      prisma.workflow.findUnique.mockResolvedValue(null);

      await expect(service.startRegeneration(orgId, workflowId)).rejects.toThrow(NotFoundException);
      expect(ai.generateDocs).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when the active org does not own the workflow', async () => {
      prisma.workflow.findUnique.mockResolvedValue({
        ...persistedWorkflow,
        organizationId: otherOrgId,
      });

      await expect(service.startRegeneration(orgId, workflowId)).rejects.toThrow(
        ForbiddenException,
      );
      expect(ai.generateDocs).not.toHaveBeenCalled();
    });

    it('should allow a co-member of the owning org to regenerate (authorizes by org)', async () => {
      // An ejected ex-author whose active org no longer owns the workflow is blocked
      // above; here the active org DOES own it, so a co-member must be allowed (W5.5).
      prisma.workflow.findUnique.mockResolvedValue(persistedWorkflow);
      ai.generateDocs.mockResolvedValue(aiResult);
      prisma.workflowDocumentation.upsert.mockResolvedValue(cachedRow);

      const result = await service.startRegeneration(orgId, workflowId);

      expect(result).toEqual({ workflowId, status: 'pending' });
      await flush();
      expect(ai.generateDocs).toHaveBeenCalledTimes(1);
    });

    it('should swallow background AI failures (returns pending, no upsert)', async () => {
      prisma.workflow.findUnique.mockResolvedValue(persistedWorkflow);
      ai.generateDocs.mockRejectedValue(new AiServiceUnavailableError('down'));

      const result = await service.startRegeneration(orgId, workflowId);
      expect(result.status).toBe('pending');

      await flush();
      expect(prisma.workflowDocumentation.upsert).not.toHaveBeenCalled();
    });
  });
});
