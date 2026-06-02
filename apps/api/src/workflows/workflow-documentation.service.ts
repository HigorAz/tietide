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
  generatedAt: Date;
}

interface AuthorizedWorkflow {
  id: string;
  userId: string;
  name: string;
  definition: Prisma.JsonValue;
  version: number;
}

@Injectable()
export class WorkflowDocumentationService {
  private readonly logger = new Logger(WorkflowDocumentationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async findExisting(
    userId: string,
    workflowId: string,
  ): Promise<WorkflowDocumentationResult | null> {
    await this.loadAuthorizedWorkflow(userId, workflowId);

    const row = await this.prisma.workflowDocumentation.findUnique({ where: { workflowId } });
    if (!row) return null;

    return {
      workflowId,
      version: row.version,
      documentation: row.documentation,
      sections: row.sections as unknown as DocumentationSections,
      model: row.model,
      generatedAt: row.updatedAt,
    };
  }

  async regenerate(userId: string, workflowId: string): Promise<WorkflowDocumentationResult> {
    const workflow = await this.loadAuthorizedWorkflow(userId, workflowId);
    return this.runAiAndUpsert(workflow);
  }

  private async loadAuthorizedWorkflow(
    userId: string,
    workflowId: string,
  ): Promise<AuthorizedWorkflow> {
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
    return workflow;
  }

  private async runAiAndUpsert(workflow: AuthorizedWorkflow): Promise<WorkflowDocumentationResult> {
    let generated;
    try {
      generated = await this.ai.generateDocs({
        workflowId: workflow.id,
        workflowName: workflow.name,
        definition: workflow.definition as Record<string, unknown>,
      });
    } catch (err) {
      if (err instanceof AiServiceUnavailableError) {
        this.logger.warn(`AI service unavailable for workflow ${workflow.id}`);
        throw new ServiceUnavailableException('AI service temporarily unavailable');
      }
      throw err;
    }

    const sectionsJson = generated.sections as unknown as Prisma.InputJsonValue;
    const row = await this.prisma.workflowDocumentation.upsert({
      where: { workflowId: workflow.id },
      create: {
        workflowId: workflow.id,
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
      workflowId: workflow.id,
      version: row.version,
      documentation: row.documentation,
      sections: row.sections as unknown as DocumentationSections,
      model: row.model,
      generatedAt: row.updatedAt,
    };
  }
}
