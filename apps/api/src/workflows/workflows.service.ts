import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { executableWorkflowDefinitionSchema, ZodError } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import type { CreateWorkflowDto } from './dto/create-workflow.dto';
import type { UpdateWorkflowDto } from './dto/update-workflow.dto';
import type { WorkflowResponseDto } from './dto/workflow-response.dto';

const SAFE_SELECT = {
  id: true,
  name: true,
  description: true,
  definition: true,
  isActive: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { executions: true } },
  documentation: { select: { updatedAt: true, version: true } },
} as const;

function assertExecutableDefinition(definition: unknown): void {
  try {
    executableWorkflowDefinitionSchema.parse(definition);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new BadRequestException({
        message: 'Workflow definition is not executable',
        issues: error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
    }
    throw error;
  }
}

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
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

  async list(userId: string): Promise<WorkflowResponseDto[]> {
    const rows = await this.prisma.workflow.findMany({
      where: { userId },
      select: SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => this.toResponse(row));
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
      dto.isActive !== undefined;

    if (!hasAnyField) {
      throw new BadRequestException(
        'Provide at least one of: name, description, definition, isActive',
      );
    }

    if (dto.definition !== undefined) {
      assertExecutableDefinition(dto.definition);
    }

    const existing = await this.prisma.workflow.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!existing) {
      throw new NotFoundException('Workflow not found');
    }
    if (existing.userId !== userId) {
      throw new ForbiddenException('You do not have access to this workflow');
    }

    const data: Prisma.WorkflowUpdateInput = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.description !== undefined) {
      data.description = dto.description;
    }
    if (dto.definition !== undefined) {
      data.definition = dto.definition as unknown as Prisma.InputJsonValue;
      data.version = { increment: 1 };
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    let row;
    if (dto.definition !== undefined) {
      row = await this.prisma.$transaction(async (tx) => {
        const prior = await tx.workflow.findUnique({
          where: { id },
          select: { definition: true, version: true },
        });
        if (!prior) {
          throw new NotFoundException('Workflow not found');
        }

        await tx.workflowVersion.create({
          data: {
            workflowId: id,
            version: prior.version,
            definition: prior.definition as Prisma.InputJsonValue,
            createdById: userId,
            message: dto.versionMessage ?? null,
          },
        });

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
      select: { userId: true },
    });
    if (!existing) {
      throw new NotFoundException('Workflow not found');
    }
    if (existing.userId !== userId) {
      throw new ForbiddenException('You do not have access to this workflow');
    }

    await this.prisma.workflow.deleteMany({ where: { id, userId } });

    await this.audit.log({
      userId,
      action: 'workflow.delete',
      resource: 'workflow',
      resourceId: id,
    });
  }

  private toResponse(row: {
    id: string;
    name: string;
    description: string | null;
    definition: unknown;
    isActive: boolean;
    version: number;
    createdAt: Date;
    updatedAt: Date;
    _count?: { executions: number };
    documentation?: { updatedAt: Date; version: number } | null;
  }): WorkflowResponseDto {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      definition: row.definition as Record<string, unknown>,
      isActive: row.isActive,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      executionCount: row._count?.executions ?? 0,
      documentation: row.documentation
        ? { generatedAt: row.documentation.updatedAt, version: row.documentation.version }
        : null,
    };
  }
}
