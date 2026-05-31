import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import type { CreateTagDto } from './dto/create-tag.dto';
import type { UpdateTagDto } from './dto/update-tag.dto';
import type { TagResponseDto } from './dto/tag-response.dto';
import { decodeKeysetCursor } from '../common/pagination/cursor';
import { buildPage, keysetWhere, type Page } from '../common/pagination/paginate';
import { resolveLimit } from '../common/pagination/page-query.dto';
import type { PageRequest } from '../common/pagination/page-request';

const SAFE_SELECT = {
  id: true,
  name: true,
  color: true,
  createdAt: true,
} as const;

@Injectable()
export class TagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async create(userId: string, dto: CreateTagDto): Promise<TagResponseDto> {
    const color = dto.color === undefined ? null : dto.color;
    let row: TagResponseDto;
    try {
      row = await this.prisma.tag.create({
        data: { userId, name: dto.name, color },
        select: SAFE_SELECT,
      });
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException('Tag with this name already exists');
      }
      throw err;
    }

    await this.audit.log({
      userId,
      action: 'tag.create',
      resource: 'tag',
      resourceId: row.id,
      metadata: { name: row.name },
    });

    return row;
  }

  async list(userId: string, page: PageRequest = {}): Promise<Page<TagResponseDto>> {
    const limit = resolveLimit(page.limit);
    let where: Prisma.TagWhereInput = { userId };
    if (page.cursor) {
      const cursor = decodeKeysetCursor(page.cursor);
      where = {
        AND: [{ userId }, keysetWhere('name', 'asc', String(cursor.v), cursor.id)],
      } as Prisma.TagWhereInput;
    }

    const peeked = await this.prisma.tag.findMany({
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

  async update(userId: string, id: string, dto: UpdateTagDto): Promise<TagResponseDto> {
    const existing = await this.prisma.tag.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Tag not found');
    }

    const data: { name?: string; color?: string | null } = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.color !== undefined) data.color = dto.color;

    let row: TagResponseDto;
    try {
      row = await this.prisma.tag.update({
        where: { id },
        data,
        select: SAFE_SELECT,
      });
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException('Tag with this name already exists');
      }
      throw err;
    }

    await this.audit.log({
      userId,
      action: 'tag.update',
      resource: 'tag',
      resourceId: id,
      metadata: { fields: Object.keys(data) },
    });

    return row;
  }

  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.tag.deleteMany({ where: { id, userId } });
    if (count === 0) {
      throw new NotFoundException('Tag not found');
    }

    await this.audit.log({
      userId,
      action: 'tag.delete',
      resource: 'tag',
      resourceId: id,
    });
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: unknown }).code === 'P2002'
    );
  }
}
