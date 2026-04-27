import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { AuditLogService } from '../audit/audit-log.service';
import type { CreateSecretDto } from './dto/create-secret.dto';
import type { UpdateSecretDto } from './dto/update-secret.dto';
import type { SecretResponseDto } from './dto/secret-response.dto';

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

  async create(userId: string, dto: CreateSecretDto): Promise<SecretResponseDto> {
    const { ciphertext, nonce } = this.crypto.encrypt(dto.value);
    let row: SecretResponseDto;
    try {
      row = await this.prisma.secret.create({
        data: {
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
      action: 'secret.create',
      resource: 'secret',
      resourceId: row.id,
      metadata: { name: row.name },
    });

    return row;
  }

  async list(userId: string): Promise<SecretResponseDto[]> {
    return this.prisma.secret.findMany({
      where: { userId },
      select: SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(userId: string, id: string, dto: UpdateSecretDto): Promise<SecretResponseDto> {
    const existing = await this.prisma.secret.findFirst({
      where: { id, userId },
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
      action: 'secret.update',
      resource: 'secret',
      resourceId: id,
      metadata: { fields: Object.keys(data) },
    });

    return row;
  }

  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.secret.deleteMany({
      where: { id, userId },
    });
    if (count === 0) {
      throw new NotFoundException('Secret not found');
    }

    await this.audit.log({
      userId,
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
