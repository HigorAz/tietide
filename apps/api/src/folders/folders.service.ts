import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import type { CreateFolderDto } from './dto/create-folder.dto';
import type { UpdateFolderDto } from './dto/update-folder.dto';
import type { DeleteFolderResultDto, FolderResponseDto } from './dto/folder-response.dto';

const SAFE_SELECT = {
  id: true,
  name: true,
  parentFolderId: true,
  createdAt: true,
} as const;

@Injectable()
export class FoldersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async create(userId: string, dto: CreateFolderDto): Promise<FolderResponseDto> {
    const parentFolderId = dto.parentFolderId ?? null;

    if (parentFolderId !== null) {
      await this.assertFolderOwnedByUser(userId, parentFolderId);
    }

    const row = await this.prisma.folder.create({
      data: { userId, name: dto.name, parentFolderId },
      select: SAFE_SELECT,
    });

    await this.audit.log({
      userId,
      action: 'folder.create',
      resource: 'folder',
      resourceId: row.id,
      metadata: { name: row.name, parentFolderId: row.parentFolderId },
    });

    return row;
  }

  async list(userId: string): Promise<FolderResponseDto[]> {
    return this.prisma.folder.findMany({
      where: { userId },
      select: SAFE_SELECT,
      orderBy: [{ parentFolderId: 'asc' }, { name: 'asc' }],
    });
  }

  async update(userId: string, id: string, dto: UpdateFolderDto): Promise<FolderResponseDto> {
    const existing = await this.prisma.folder.findFirst({
      where: { id, userId },
      select: { id: true, parentFolderId: true },
    });
    if (!existing) {
      throw new NotFoundException('Folder not found');
    }

    if (dto.parentFolderId !== undefined && dto.parentFolderId !== null) {
      if (dto.parentFolderId === id) {
        throw new BadRequestException('Cannot move a folder into itself');
      }
      await this.assertFolderOwnedByUser(userId, dto.parentFolderId);
      if (await this.wouldCreateCycle(userId, id, dto.parentFolderId)) {
        throw new BadRequestException('Cannot move a folder into its own descendant');
      }
    }

    const data: { name?: string; parentFolderId?: string | null } = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.parentFolderId !== undefined) data.parentFolderId = dto.parentFolderId;

    const row = await this.prisma.folder.update({
      where: { id },
      data,
      select: SAFE_SELECT,
    });

    await this.audit.log({
      userId,
      action: 'folder.update',
      resource: 'folder',
      resourceId: id,
      metadata: { fields: Object.keys(data) },
    });

    return row;
  }

  async remove(userId: string, id: string): Promise<DeleteFolderResultDto> {
    const existing = await this.prisma.folder.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Folder not found');
    }

    const descendants = await this.collectDescendantIds(userId, id);
    const allIds = [id, ...descendants];

    const deletedWorkflows = await this.prisma.workflow.count({
      where: { userId, folderId: { in: allIds } },
    });

    // Postgres FK cascades remove descendant folders + their workflows.
    await this.prisma.folder.delete({ where: { id } });

    const result: DeleteFolderResultDto = {
      deletedFolders: allIds.length,
      deletedWorkflows,
    };

    await this.audit.log({
      userId,
      action: 'folder.delete',
      resource: 'folder',
      resourceId: id,
      metadata: { ...result },
    });

    return result;
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

  private async wouldCreateCycle(
    userId: string,
    folderId: string,
    newParentId: string,
  ): Promise<boolean> {
    let cursor: string | null = newParentId;
    const visited = new Set<string>();
    while (cursor !== null) {
      if (cursor === folderId) return true;
      if (visited.has(cursor)) return false;
      visited.add(cursor);
      const parent: { parentFolderId: string | null } | null = await this.prisma.folder.findFirst({
        where: { id: cursor, userId },
        select: { parentFolderId: true },
      });
      cursor = parent?.parentFolderId ?? null;
    }
    return false;
  }

  private async collectDescendantIds(userId: string, rootId: string): Promise<string[]> {
    const result: string[] = [];
    const queue: string[] = [rootId];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      const children: { id: string }[] = await this.prisma.folder.findMany({
        where: { userId, parentFolderId: current },
        select: { id: true },
      });
      for (const child of children) {
        result.push(child.id);
        queue.push(child.id);
      }
    }
    return result;
  }
}
