import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiService, AiServiceUnavailableError, type DocumentationSections } from '../ai/ai.service';

export interface WorkflowDocumentationResult {
  workflowId: string;
  version: number;
  documentation: string;
  sections: DocumentationSections;
  model: string;
  cached: boolean;
  generatedAt: Date;
}

@Injectable()
export class WorkflowDocumentationService {
  private readonly logger = new Logger(WorkflowDocumentationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async generate(userId: string, workflowId: string): Promise<WorkflowDocumentationResult> {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { id: true, userId: true, name: true, definition: true, version: true },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }
    if (workflow.userId !== userId) {
      throw new ForbiddenException('You do not have access to this workflow');
    }

    const cached = await this.prisma.workflowDocumentation.findUnique({
      where: { workflowId },
    });

    if (cached && cached.version === workflow.version) {
      return {
        workflowId,
        version: cached.version,
        documentation: cached.documentation,
        sections: cached.sections as unknown as DocumentationSections,
        model: cached.model,
        cached: true,
        generatedAt: cached.updatedAt,
      };
    }

    let generated;
    try {
      generated = await this.ai.generateDocs({
        workflowId,
        workflowName: workflow.name,
        definition: workflow.definition as Record<string, unknown>,
      });
    } catch (err) {
      if (err instanceof AiServiceUnavailableError) {
        this.logger.warn(`AI service unavailable for workflow ${workflowId}`);
        throw new ServiceUnavailableException('AI service temporarily unavailable');
      }
      throw err;
    }

    const sectionsJson = generated.sections as unknown as Prisma.InputJsonValue;
    const row = await this.prisma.workflowDocumentation.upsert({
      where: { workflowId },
      create: {
        workflowId,
        version: workflow.version,
        documentation: generated.documentation,
        sections: sectionsJson,
        model: generated.model,
      },
      update: {
        version: workflow.version,
        documentation: generated.documentation,
        sections: sectionsJson,
        model: generated.model,
      },
    });

    return {
      workflowId,
      version: row.version,
      documentation: row.documentation,
      sections: row.sections as unknown as DocumentationSections,
      model: row.model,
      cached: false,
      generatedAt: row.updatedAt,
    };
  }
}
