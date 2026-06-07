import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import type { CreateFolderDto } from './dto/create-folder.dto';
import type { UpdateFolderDto } from './dto/update-folder.dto';
import type { DeleteFolderResultDto, FolderResponseDto } from './dto/folder-response.dto';
import { decodeKeysetCursor } from '../common/pagination/cursor';
import { buildPage, keysetWhere, type Page } from '../common/pagination/paginate';
import { resolveLimit } from '../common/pagination/page-query.dto';
import type { PageRequest } from '../common/pagination/page-request';

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

  async create(
    organizationId: string,
    userId: string,
    dto: CreateFolderDto,
  ): Promise<FolderResponseDto> {
    const parentFolderId = dto.parentFolderId ?? null;

    if (parentFolderId !== null) {
      await this.assertFolderInOrg(organizationId, parentFolderId);
    }

    const row = await this.prisma.folder.create({
      data: { organizationId, userId, name: dto.name, parentFolderId },
      select: SAFE_SELECT,
    });

    await this.audit.log({
      userId,
      organizationId,
      action: 'folder.create',
      resource: 'folder',
      resourceId: row.id,
      metadata: { name: row.name, parentFolderId: row.parentFolderId },
    });

    return row;
  }

  async list(organizationId: string, page: PageRequest = {}): Promise<Page<FolderResponseDto>> {
    const limit = resolveLimit(page.limit);
    // Keyset on (name asc, id asc). The tree is reconstructed client-side from
    // parentFolderId, so a global name order still presents each parent's
    // children in name order while giving a strict, cursorable total order.
    let where: Prisma.FolderWhereInput = { organizationId };
    if (page.cursor) {
      const cursor = decodeKeysetCursor(page.cursor);
      where = {
        AND: [{ organizationId }, keysetWhere('name', 'asc', String(cursor.v), cursor.id)],
      } as Prisma.FolderWhereInput;
    }

    const peeked = await this.prisma.folder.findMany({
      where,
      select: SAFE_SELECT,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });

    return buildPage(
      peeked,
      limit,
      (row) => row,
      (row) => ({ v: row.name, id: row.id }),
    );
  }

  async update(
    organizationId: string,
    userId: string,
    id: string,
    dto: UpdateFolderDto,
  ): Promise<FolderResponseDto> {
    const existing = await this.prisma.folder.findFirst({
      where: { id, organizationId },
      select: { id: true, parentFolderId: true },
    });
    if (!existing) {
      throw new NotFoundException('Folder not found');
    }

    if (dto.parentFolderId !== undefined && dto.parentFolderId !== null) {
      if (dto.parentFolderId === id) {
        throw new BadRequestException('Cannot move a folder into itself');
      }
      await this.assertFolderInOrg(organizationId, dto.parentFolderId);
      if (await this.wouldCreateCycle(organizationId, id, dto.parentFolderId)) {
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
      organizationId,
      action: 'folder.update',
      resource: 'folder',
      resourceId: id,
      metadata: { fields: Object.keys(data) },
    });

    return row;
  }

  async remove(organizationId: string, userId: string, id: string): Promise<DeleteFolderResultDto> {
    const existing = await this.prisma.folder.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Folder not found');
    }

    const descendants = await this.collectDescendantIds(organizationId, id);
    const allIds = [id, ...descendants];

    const deletedWorkflows = await this.prisma.workflow.count({
      where: { organizationId, folderId: { in: allIds } },
    });

    // Postgres FK cascades remove descendant folders + their workflows.
    await this.prisma.folder.delete({ where: { id } });

    const result: DeleteFolderResultDto = {
      deletedFolders: allIds.length,
      deletedWorkflows,
    };

    await this.audit.log({
      userId,
      organizationId,
      action: 'folder.delete',
      resource: 'folder',
      resourceId: id,
      metadata: { ...result },
    });

    return result;
  }

  private async assertFolderInOrg(organizationId: string, folderId: string): Promise<void> {
    const owned = await this.prisma.folder.findFirst({
      where: { id: folderId, organizationId },
      select: { id: true },
    });
    if (!owned) {
      throw new NotFoundException('Folder not found');
    }
  }

  private async wouldCreateCycle(
    organizationId: string,
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
        where: { id: cursor, organizationId },
        select: { parentFolderId: true },
      });
      cursor = parent?.parentFolderId ?? null;
    }
    return false;
  }

  private async collectDescendantIds(organizationId: string, rootId: string): Promise<string[]> {
    const result: string[] = [];
    const queue: string[] = [rootId];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      const children: { id: string }[] = await this.prisma.folder.findMany({
        where: { organizationId, parentFolderId: current },
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
