import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
} as const;

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateWorkflowDto): Promise<WorkflowResponseDto> {
    const row = await this.prisma.workflow.create({
      data: {
        userId,
        name: dto.name,
        description: dto.description ?? null,
        definition: dto.definition as unknown as Prisma.InputJsonValue,
      },
      select: SAFE_SELECT,
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

    const data: Prisma.WorkflowUpdateInput = { version: { increment: 1 } };
    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.description !== undefined) {
      data.description = dto.description;
    }
    if (dto.definition !== undefined) {
      data.definition = dto.definition as unknown as Prisma.InputJsonValue;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    const row = await this.prisma.workflow.update({
      where: { id },
      data,
      select: SAFE_SELECT,
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
    };
  }
}
