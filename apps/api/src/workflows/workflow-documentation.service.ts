import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { WorkflowDefinition } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AiService, AiServiceUnavailableError, type DocumentationSections } from '../ai/ai.service';
import { extractWorkflowFacts } from '../ai/workflow-facts';

export interface WorkflowDocumentationResult {
  workflowId: string;
  version: number;
  documentation: string;
  sections: DocumentationSections;
  model: string;
  generatedAt: Date;
}

export interface DocumentationRegenerationStarted {
  workflowId: string;
  status: 'pending';
}

interface AuthorizedWorkflow {
  id: string;
  organizationId: string;
  name: string;
  definition: Prisma.JsonValue;
  version: number;
}

@Injectable()
export class WorkflowDocumentationService {
  private readonly logger = new Logger(WorkflowDocumentationService.name);
  // Workflows whose documentation is generating right now. Generation runs in
  // the background (it can take minutes on a CPU-only Ollama, longer than the
  // Cloudflare edge timeout), so we guard against duplicate concurrent runs for
  // the same workflow while a client polls GET /documentation for the result.
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async findExisting(
    organizationId: string,
    workflowId: string,
  ): Promise<WorkflowDocumentationResult | null> {
    await this.loadAuthorizedWorkflow(organizationId, workflowId);

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

  /**
   * Kick off documentation generation in the background and return immediately.
   * Ownership/existence are validated synchronously (so the caller still gets a
   * 404/403 right away); the slow AI call then runs detached and upserts the row
   * on completion. Clients poll GET /documentation for the result — this avoids
   * holding an HTTP request open past the Cloudflare 524 (~100s) edge timeout.
   */
  async startRegeneration(
    organizationId: string,
    workflowId: string,
  ): Promise<DocumentationRegenerationStarted> {
    const workflow = await this.loadAuthorizedWorkflow(organizationId, workflowId);

    if (!this.inFlight.has(workflowId)) {
      this.inFlight.add(workflowId);
      void this.runAiAndUpsert(workflow)
        .catch((err: unknown) => {
          this.logger.warn(
            `Background documentation generation failed for ${workflowId}: ${
              (err as Error).message
            }`,
          );
        })
        .finally(() => {
          this.inFlight.delete(workflowId);
        });
    }

    return { workflowId, status: 'pending' };
  }

  private async loadAuthorizedWorkflow(
    organizationId: string,
    workflowId: string,
  ): Promise<AuthorizedWorkflow> {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { id: true, organizationId: true, name: true, definition: true, version: true },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }
    // Authorize against the active organization, not the original author. An
    // ejected ex-author whose active org no longer owns the workflow must be
    // 403'd; conversely a co-member of the owning org must be allowed (W5.5).
    if (workflow.organizationId !== organizationId) {
      throw new ForbiddenException('You do not have access to this workflow');
    }
    return workflow;
  }

  private async runAiAndUpsert(workflow: AuthorizedWorkflow): Promise<WorkflowDocumentationResult> {
    let generated;
    try {
      // Ground the LLM in computed facts so it documents the real graph,
      // connections, and branches rather than inferring them from raw JSON.
      const facts = extractWorkflowFacts(workflow.definition as unknown as WorkflowDefinition);
      generated = await this.ai.generateDocs({
        workflowId: workflow.id,
        workflowName: workflow.name,
        definition: workflow.definition as Record<string, unknown>,
        facts,
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
