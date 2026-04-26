import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
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

  const userId = 'user-uuid-1';
  const otherUserId = 'user-uuid-2';
  const workflowId = '550e8400-e29b-41d4-a716-446655440000';
  const definition = {
    nodes: [
      { id: 'n1', type: 'manual-trigger', name: 'Start', position: { x: 0, y: 0 }, config: {} },
    ],
    edges: [],
  };

  const persistedWorkflow = {
    id: workflowId,
    userId,
    name: 'Demo',
    definition,
    version: 3,
  };

  const generatedSections = {
    objective: 'obj',
    triggers: 'trig',
    actions: 'act',
    dataFlow: 'flow',
    decisions: 'dec',
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

  describe('generate', () => {
    it('should return cached docs when version matches and not call AI service', async () => {
      prisma.workflow.findUnique.mockResolvedValue(persistedWorkflow);
      prisma.workflowDocumentation.findUnique.mockResolvedValue(cachedRow);

      const result = await service.generate(userId, workflowId);

      expect(ai.generateDocs).not.toHaveBeenCalled();
      expect(prisma.workflowDocumentation.upsert).not.toHaveBeenCalled();
      expect(result).toEqual({
        workflowId,
        version: 3,
        documentation: '# Demo\nCached text',
        sections: generatedSections,
        model: 'llama3.1:8b',
        cached: true,
        generatedAt: cachedRow.updatedAt,
      });
    });

    it('should call AI service and upsert when no cache exists', async () => {
      prisma.workflow.findUnique.mockResolvedValue(persistedWorkflow);
      prisma.workflowDocumentation.findUnique.mockResolvedValue(null);
      ai.generateDocs.mockResolvedValue({
        documentation: '# Demo\nFresh text',
        sections: generatedSections,
        model: 'llama3.1:8b',
      });
      prisma.workflowDocumentation.upsert.mockResolvedValue({
        ...cachedRow,
        documentation: '# Demo\nFresh text',
        updatedAt: new Date('2026-04-26T01:00:00Z'),
      });

      const result = await service.generate(userId, workflowId);

      expect(ai.generateDocs).toHaveBeenCalledWith({
        workflowId,
        workflowName: 'Demo',
        definition,
      });
      expect(prisma.workflowDocumentation.upsert).toHaveBeenCalledWith({
        where: { workflowId },
        create: {
          workflowId,
          version: 3,
          documentation: '# Demo\nFresh text',
          sections: generatedSections,
          model: 'llama3.1:8b',
        },
        update: {
          version: 3,
          documentation: '# Demo\nFresh text',
          sections: generatedSections,
          model: 'llama3.1:8b',
        },
      });
      expect(result.cached).toBe(false);
      expect(result.documentation).toBe('# Demo\nFresh text');
    });

    it('should regenerate when cached version is stale', async () => {
      prisma.workflow.findUnique.mockResolvedValue(persistedWorkflow);
      prisma.workflowDocumentation.findUnique.mockResolvedValue({ ...cachedRow, version: 2 });
      ai.generateDocs.mockResolvedValue({
        documentation: '# Demo\nFresh text',
        sections: generatedSections,
        model: 'llama3.1:8b',
      });
      prisma.workflowDocumentation.upsert.mockResolvedValue({
        ...cachedRow,
        documentation: '# Demo\nFresh text',
      });

      const result = await service.generate(userId, workflowId);

      expect(ai.generateDocs).toHaveBeenCalledTimes(1);
      expect(prisma.workflowDocumentation.upsert).toHaveBeenCalledTimes(1);
      expect(result.cached).toBe(false);
    });

    it('should throw NotFoundException when workflow does not exist', async () => {
      prisma.workflow.findUnique.mockResolvedValue(null);

      await expect(service.generate(userId, workflowId)).rejects.toThrow(NotFoundException);
      expect(ai.generateDocs).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when caller does not own the workflow', async () => {
      prisma.workflow.findUnique.mockResolvedValue({ ...persistedWorkflow, userId: otherUserId });

      await expect(service.generate(userId, workflowId)).rejects.toThrow(ForbiddenException);
      expect(ai.generateDocs).not.toHaveBeenCalled();
    });

    it('should translate AiServiceUnavailableError into 503 ServiceUnavailableException', async () => {
      prisma.workflow.findUnique.mockResolvedValue(persistedWorkflow);
      prisma.workflowDocumentation.findUnique.mockResolvedValue(null);
      ai.generateDocs.mockRejectedValue(new AiServiceUnavailableError('down'));

      await expect(service.generate(userId, workflowId)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(prisma.workflowDocumentation.upsert).not.toHaveBeenCalled();
    });
  });
});
