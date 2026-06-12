import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { LIBRARY_TEMPLATES, type LibraryTemplate } from './templates';
import type { WorkflowResponseDto } from '../workflows/dto/workflow-response.dto';
import type { TemplateResponseDto } from './dto/template-response.dto';

@Injectable()
export class LibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly entitlements: EntitlementsService,
  ) {}

  list(): TemplateResponseDto[] {
    return LIBRARY_TEMPLATES.map(toTemplateResponse);
  }

  async instantiate(
    organizationId: string,
    userId: string,
    slug: string,
  ): Promise<WorkflowResponseDto> {
    const fixture = LIBRARY_TEMPLATES.find((f) => f.slug === slug);
    if (!fixture) {
      throw new NotFoundException(`Template '${slug}' not found`);
    }

    await this.entitlements.assertCanCreateWorkflow(organizationId);

    // Library instantiation always creates an inactive workflow. This prevents a
    // single click from exposing a publicly callable webhook URL on a forked
    // workflow — the user opts in via the toggle on /workflows after reviewing.
    const created = await this.prisma.workflow.create({
      data: {
        organizationId,
        userId,
        name: fixture.name,
        description: fixture.description,
        definition: fixture.definition as unknown as Prisma.InputJsonValue,
        isActive: false,
      },
      select: {
        id: true,
        name: true,
        description: true,
        definition: true,
        isActive: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (fixture.webhook) {
      // Random suffix per instantiation so re-instantiating the same template never collides on path uniqueness.
      const path = `${fixture.webhook.pathSuffix}-${randomBytes(4).toString('hex')}`;
      const hmacSecret = randomBytes(32).toString('hex');
      await this.prisma.webhook.create({
        data: {
          workflowId: created.id,
          path,
          hmacSecret,
          isActive: true,
        },
      });
    }

    await this.audit.log({
      userId,
      organizationId,
      action: 'library.instantiate',
      resource: 'workflow',
      resourceId: created.id,
      metadata: { slug: fixture.slug, templateName: fixture.name },
    });

    return {
      id: created.id,
      name: created.name,
      description: created.description,
      definition: created.definition as Record<string, unknown>,
      isActive: created.isActive,
      version: created.version,
      folderId: null,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      executionCount: 0,
      documentation: null,
      tags: [],
    };
  }
}

function toTemplateResponse(fixture: LibraryTemplate): TemplateResponseDto {
  const nodeTypes = Array.from(new Set(fixture.definition.nodes.map((n) => n.type)));
  return {
    slug: fixture.slug,
    name: fixture.name,
    description: fixture.description,
    category: fixture.category,
    nodeTypes,
  };
}
