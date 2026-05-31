import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { WorkflowDefinition } from '@tietide/shared';
import {
  executableWorkflowDefinitionSchema,
  validateWorkflowTopology,
  ZodError,
} from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { ActivationService } from '../provider-triggers/activation.service';
import type { CreateWorkflowDto } from './dto/create-workflow.dto';
import type { UpdateWorkflowDto } from './dto/update-workflow.dto';
import type { WorkflowResponseDto } from './dto/workflow-response.dto';
import type { WorkflowListItemDto } from './dto/workflow-list-response.dto';
import { decodeKeysetCursor } from '../common/pagination/cursor';
import { buildPage, type Page } from '../common/pagination/paginate';
import { resolveLimit } from '../common/pagination/page-query.dto';

const SAFE_SELECT = {
  id: true,
  name: true,
  description: true,
  definition: true,
  isActive: true,
  version: true,
  folderId: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { executions: true } },
  documentation: { select: { updatedAt: true, version: true } },
  tags: {
    select: {
      tag: { select: { id: true, name: true, color: true } },
    },
  },
} as const;

// List projection: every SAFE_SELECT field except the heavy `definition` JSONB,
// which list views never render (W3.2).
const { definition: _omitDefinition, ...LIST_SELECT } = SAFE_SELECT;

export interface WorkflowListFilter {
  folderId?: string | null;
  tagIds?: string[];
  limit?: number;
  cursor?: string;
}

function assertExecutableDefinition(definition: unknown): void {
  let parsed: WorkflowDefinition;
  try {
    parsed = executableWorkflowDefinitionSchema.parse(definition);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new UnprocessableEntityException({
        message: 'Workflow definition is not executable',
        issues: error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
    }
    throw error;
  }

  // Empty workflows are saved as drafts so users can pick a trigger from the
  // sidebar without being forced to commit to one before the canvas opens.
  // Topology (trigger count, no cycles, no dangling edges) is still enforced
  // at execute/activate time by the Worker's topologicalSort.
  if (parsed.nodes.length === 0) {
    return;
  }

  const topologyIssues = validateWorkflowTopology(parsed);
  if (topologyIssues.length > 0) {
    throw new UnprocessableEntityException({
      message: 'Workflow topology is invalid',
      issues: topologyIssues.map((issue) => ({
        code: issue.code,
        path: issue.path,
        message: issue.message,
      })),
    });
  }
}

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly activation: ActivationService,
  ) {}

  async create(userId: string, dto: CreateWorkflowDto): Promise<WorkflowResponseDto> {
    assertExecutableDefinition(dto.definition);

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.workflow.create({
        data: {
          userId,
          name: dto.name,
          description: dto.description ?? null,
          definition: dto.definition as unknown as Prisma.InputJsonValue,
        },
        select: SAFE_SELECT,
      });

      await tx.workflowVersion.create({
        data: {
          workflowId: created.id,
          version: created.version,
          definition: dto.definition as unknown as Prisma.InputJsonValue,
          createdById: userId,
          message: 'initial version',
        },
      });

      return created;
    });

    await this.audit.log({
      userId,
      action: 'workflow.create',
      resource: 'workflow',
      resourceId: row.id,
      metadata: { name: row.name },
    });

    return this.toResponse(row);
  }

  async list(userId: string, filter: WorkflowListFilter = {}): Promise<Page<WorkflowListItemDto>> {
    const baseWhere: Prisma.WorkflowWhereInput = { userId };
    if (filter.folderId !== undefined) {
      baseWhere.folderId = filter.folderId;
    }
    if (filter.tagIds && filter.tagIds.length > 0) {
      baseWhere.tags = { some: { tagId: { in: filter.tagIds } } };
    }

    const limit = resolveLimit(filter.limit);

    // Keyset pagination on (createdAt desc, id desc): a strict total order so a
    // cursor unambiguously resumes after the last row of the previous page.
    let where: Prisma.WorkflowWhereInput = baseWhere;
    if (filter.cursor) {
      const cursor = decodeKeysetCursor(filter.cursor);
      const createdAt = new Date(cursor.v as string);
      where = {
        AND: [
          baseWhere,
          {
            OR: [
              { createdAt: { lt: createdAt } },
              { AND: [{ createdAt }, { id: { lt: cursor.id } }] },
            ],
          },
        ],
      };
    }

    const peeked = await this.prisma.workflow.findMany({
      where,
      select: LIST_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    return buildPage(
      peeked,
      limit,
      (row) => this.toListItem(row),
      (row) => ({ v: row.createdAt.toISOString(), id: row.id }),
    );
  }

  async findOne(userId: string, id: string): Promise<WorkflowResponseDto> {
    const row = await this.prisma.workflow.findUnique({
      where: { id },
      select: { ...SAFE_SELECT, userId: true },
    });

    if (!row) {
      throw new NotFoundException('Workflow not found');
    }
    if (row.userId !== userId) {
      throw new ForbiddenException('You do not have access to this workflow');
    }

    const { userId: _ownerId, ...rest } = row;
    return this.toResponse(rest);
  }

  async update(userId: string, id: string, dto: UpdateWorkflowDto): Promise<WorkflowResponseDto> {
    const hasAnyField =
      dto.name !== undefined ||
      dto.description !== undefined ||
      dto.definition !== undefined ||
      dto.isActive !== undefined ||
      dto.folderId !== undefined ||
      dto.tagIds !== undefined;

    if (!hasAnyField) {
      throw new BadRequestException(
        'Provide at least one of: name, description, definition, isActive, folderId, tagIds',
      );
    }

    if (dto.definition !== undefined) {
      assertExecutableDefinition(dto.definition);
    }

    const existing = await this.prisma.workflow.findUnique({
      where: { id },
      select: { userId: true, isActive: true, definition: true },
    });
    if (!existing) {
      throw new NotFoundException('Workflow not found');
    }
    if (existing.userId !== userId) {
      throw new ForbiddenException('You do not have access to this workflow');
    }

    if (dto.folderId !== undefined && dto.folderId !== null) {
      await this.assertFolderOwnedByUser(userId, dto.folderId);
    }

    if (dto.tagIds !== undefined && dto.tagIds.length > 0) {
      await this.assertTagsOwnedByUser(userId, dto.tagIds);
    }

    const willActivate = dto.isActive === true && existing.isActive === false;
    const willDeactivate = dto.isActive === false && existing.isActive === true;
    const definitionForActivation =
      (dto.definition as unknown as Prisma.JsonValue | undefined) ?? existing.definition;

    const data: Prisma.WorkflowUpdateInput = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.description !== undefined) {
      data.description = dto.description;
    }
    if (dto.definition !== undefined) {
      data.definition = dto.definition as unknown as Prisma.InputJsonValue;
      // version bumped explicitly inside the transaction below — needed so we can
      // snapshot the new (workflowId, version) into WorkflowVersion atomically.
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }
    if (dto.folderId !== undefined) {
      data.folder =
        dto.folderId === null ? { disconnect: true } : { connect: { id: dto.folderId } };
    }
    if (dto.tagIds !== undefined) {
      data.tags = {
        deleteMany: {},
        create: dto.tagIds.map((tagId) => ({ tag: { connect: { id: tagId } } })),
      };
    }

    const needsTransaction = dto.definition !== undefined || willActivate || willDeactivate;

    let row;
    if (needsTransaction) {
      row = await this.prisma.$transaction(async (tx) => {
        if (dto.definition !== undefined) {
          const prior = await tx.workflow.findUnique({
            where: { id },
            select: { definition: true, version: true },
          });
          if (!prior) {
            throw new NotFoundException('Workflow not found');
          }

          // Bump the workflow version and snapshot the NEW definition at the NEW
          // version. WorkflowVersion(create) already populates v1, so the prior
          // approach of snapshotting (prior.version, prior.definition) on update
          // collided with that initial row on the first save (P2002).
          const newVersion = prior.version + 1;
          data.version = newVersion;

          await tx.workflowVersion.create({
            data: {
              workflowId: id,
              version: newVersion,
              definition: dto.definition as unknown as Prisma.InputJsonValue,
              createdById: userId,
              message: dto.versionMessage ?? null,
            },
          });
        }

        if (willDeactivate) {
          await this.activation.deactivateForWorkflow({
            workflowId: id,
            userId,
            definition: existing.definition,
            tx,
          });
        }

        if (willActivate) {
          await this.activation.activateForWorkflow({
            workflowId: id,
            userId,
            definition: definitionForActivation,
            tx,
          });
        }

        return tx.workflow.update({
          where: { id },
          data,
          select: SAFE_SELECT,
        });
      });
    } else {
      row = await this.prisma.workflow.update({
        where: { id },
        data,
        select: SAFE_SELECT,
      });
    }

    await this.audit.log({
      userId,
      action: 'workflow.update',
      resource: 'workflow',
      resourceId: id,
      metadata: { fields: Object.keys(data).filter((k) => k !== 'version') },
    });

    return this.toResponse(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.workflow.findUnique({
      where: { id },
      select: { userId: true, isActive: true, definition: true },
    });
    if (!existing) {
      throw new NotFoundException('Workflow not found');
    }
    if (existing.userId !== userId) {
      throw new ForbiddenException('You do not have access to this workflow');
    }

    if (existing.isActive) {
      await this.activation.deactivateForWorkflow({
        workflowId: id,
        userId,
        definition: existing.definition,
      });
    }

    await this.prisma.workflow.deleteMany({ where: { id, userId } });

    await this.audit.log({
      userId,
      action: 'workflow.delete',
      resource: 'workflow',
      resourceId: id,
    });
  }

  private async assertFolderOwnedByUser(userId: string, folderId: string): Promise<void> {
    const owned = await this.prisma.folder.findFirst({
      where: { id: folderId, userId },
      select: { id: true },
    });
    if (!owned) {
      throw new NotFoundException('Folder not found');
    }
  }

  private async assertTagsOwnedByUser(userId: string, tagIds: string[]): Promise<void> {
    const owned = await this.prisma.tag.findMany({
      where: { id: { in: tagIds }, userId },
      select: { id: true },
    });
    if (owned.length !== tagIds.length) {
      throw new NotFoundException('One or more tags not found');
    }
  }

  private toResponse(row: {
    id: string;
    name: string;
    description: string | null;
    definition: unknown;
    isActive: boolean;
    version: number;
    folderId?: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count?: { executions: number };
    documentation?: { updatedAt: Date; version: number } | null;
    tags?: { tag: { id: string; name: string; color: string | null } }[];
  }): WorkflowResponseDto {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      definition: row.definition as Record<string, unknown>,
      isActive: row.isActive,
      version: row.version,
      folderId: row.folderId ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      executionCount: row._count?.executions ?? 0,
      documentation: row.documentation
        ? { generatedAt: row.documentation.updatedAt, version: row.documentation.version }
        : null,
      tags: (row.tags ?? []).map((t) => t.tag),
    };
  }

  private toListItem(row: {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
    version: number;
    folderId?: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count?: { executions: number };
    documentation?: { updatedAt: Date; version: number } | null;
    tags?: { tag: { id: string; name: string; color: string | null } }[];
  }): WorkflowListItemDto {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      isActive: row.isActive,
      version: row.version,
      folderId: row.folderId ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      executionCount: row._count?.executions ?? 0,
      documentation: row.documentation
        ? { generatedAt: row.documentation.updatedAt, version: row.documentation.version }
        : null,
      tags: (row.tags ?? []).map((t) => t.tag),
    };
  }
}
