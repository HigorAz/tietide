import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { AuditLogService } from '../audit/audit-log.service';
import type { CreateSecretDto } from './dto/create-secret.dto';
import type { UpdateSecretDto } from './dto/update-secret.dto';
import type { SecretResponseDto } from './dto/secret-response.dto';
import { decodeKeysetCursor } from '../common/pagination/cursor';
import { buildPage, keysetWhere, type Page } from '../common/pagination/paginate';
import { resolveLimit } from '../common/pagination/page-query.dto';
import type { PageRequest } from '../common/pagination/page-request';

const SAFE_SELECT = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class SecretsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditLogService,
  ) {}

  async create(
    organizationId: string,
    userId: string,
    dto: CreateSecretDto,
  ): Promise<SecretResponseDto> {
    const { ciphertext, nonce } = this.crypto.encrypt(dto.value);
    let row: SecretResponseDto;
    try {
      row = await this.prisma.secret.create({
        data: {
          organizationId,
          userId,
          name: dto.name,
          value: ciphertext,
          nonce,
        },
        select: SAFE_SELECT,
      });
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException('Secret with this name already exists');
      }
      throw err;
    }

    await this.audit.log({
      userId,
      organizationId,
      action: 'secret.create',
      resource: 'secret',
      resourceId: row.id,
      metadata: { name: row.name },
    });

    return row;
  }

  async list(organizationId: string, page: PageRequest = {}): Promise<Page<SecretResponseDto>> {
    const limit = resolveLimit(page.limit);
    let where: Prisma.SecretWhereInput = { organizationId };
    if (page.cursor) {
      const cursor = decodeKeysetCursor(page.cursor);
      where = {
        AND: [
          { organizationId },
          keysetWhere('createdAt', 'desc', new Date(cursor.v as string), cursor.id),
        ],
      } as Prisma.SecretWhereInput;
    }

    const peeked = await this.prisma.secret.findMany({
      where,
      select: SAFE_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    return buildPage(
      peeked,
      limit,
      (row) => row,
      (row) => ({ v: row.createdAt.toISOString(), id: row.id }),
    );
  }

  async update(
    organizationId: string,
    userId: string,
    id: string,
    dto: UpdateSecretDto,
  ): Promise<SecretResponseDto> {
    const existing = await this.prisma.secret.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Secret not found');
    }

    const data: { name?: string; value?: string; nonce?: string } = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.value !== undefined) {
      const { ciphertext, nonce } = this.crypto.encrypt(dto.value);
      data.value = ciphertext;
      data.nonce = nonce;
    }

    let row: SecretResponseDto;
    try {
      row = await this.prisma.secret.update({
        where: { id },
        data,
        select: SAFE_SELECT,
      });
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException('Secret with this name already exists');
      }
      throw err;
    }

    await this.audit.log({
      userId,
      organizationId,
      action: 'secret.update',
      resource: 'secret',
      resourceId: id,
      metadata: { fields: Object.keys(data) },
    });

    return row;
  }

  async remove(organizationId: string, userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.secret.deleteMany({
      where: { id, organizationId },
    });
    if (count === 0) {
      throw new NotFoundException('Secret not found');
    }

    await this.audit.log({
      userId,
      organizationId,
      action: 'secret.delete',
      resource: 'secret',
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
