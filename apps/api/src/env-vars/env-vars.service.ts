import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { AuditLogService } from '../audit/audit-log.service';
import type { CreateEnvVarDto } from './dto/create-env-var.dto';
import type { UpdateEnvVarDto } from './dto/update-env-var.dto';
import type { EnvVarResponseDto } from './dto/env-var-response.dto';

export type EnvVarScope = 'GLOBAL' | 'USER';

const SAFE_SELECT = {
  id: true,
  key: true,
  scope: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface ScopeContext {
  scope: EnvVarScope;
  ownerUserId: string | null;
  actorUserId: string;
}

interface CreateInput extends ScopeContext {
  dto: CreateEnvVarDto;
}

interface UpdateInput extends ScopeContext {
  id: string;
  dto: UpdateEnvVarDto;
}

interface RemoveInput extends ScopeContext {
  id: string;
}

interface ListInput {
  scope: EnvVarScope;
  ownerUserId: string | null;
}

@Injectable()
export class EnvVarsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditLogService,
  ) {}

  async create(input: CreateInput): Promise<EnvVarResponseDto> {
    const { scope, ownerUserId, actorUserId, dto } = input;
    const { ciphertext, nonce } = this.crypto.encrypt(dto.value);

    let row: EnvVarResponseDto;
    try {
      row = (await this.prisma.environmentVariable.create({
        data: {
          scope,
          userId: ownerUserId,
          key: dto.key,
          valueEnc: ciphertext,
          valueNonce: nonce,
        },
        select: SAFE_SELECT,
      })) as EnvVarResponseDto;
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException(`Env var "${dto.key}" already exists in ${scope} scope`);
      }
      throw err;
    }

    await this.audit.log({
      userId: actorUserId,
      action: 'env-var.create',
      resource: 'env-var',
      resourceId: row.id,
      metadata: { key: dto.key, scope },
    });

    return row;
  }

  async list(input: ListInput): Promise<EnvVarResponseDto[]> {
    return (await this.prisma.environmentVariable.findMany({
      where: { scope: input.scope, userId: input.ownerUserId },
      select: SAFE_SELECT,
      orderBy: { key: 'asc' },
    })) as EnvVarResponseDto[];
  }

  async update(input: UpdateInput): Promise<EnvVarResponseDto> {
    const { scope, ownerUserId, actorUserId, id, dto } = input;

    const existing = await this.prisma.environmentVariable.findFirst({
      where: { id, scope, userId: ownerUserId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Env var not found');
    }

    const data: { key?: string; valueEnc?: string; valueNonce?: string } = {};
    if (dto.key !== undefined) {
      data.key = dto.key;
    }
    if (dto.value !== undefined) {
      const { ciphertext, nonce } = this.crypto.encrypt(dto.value);
      data.valueEnc = ciphertext;
      data.valueNonce = nonce;
    }

    let row: EnvVarResponseDto;
    try {
      row = (await this.prisma.environmentVariable.update({
        where: { id },
        data,
        select: SAFE_SELECT,
      })) as EnvVarResponseDto;
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException('Env var with this key already exists in scope');
      }
      throw err;
    }

    await this.audit.log({
      userId: actorUserId,
      action: 'env-var.update',
      resource: 'env-var',
      resourceId: id,
      metadata: { fields: Object.keys(data), scope },
    });

    return row;
  }

  async remove(input: RemoveInput): Promise<void> {
    const { scope, ownerUserId, actorUserId, id } = input;

    const { count } = await this.prisma.environmentVariable.deleteMany({
      where: { id, scope, userId: ownerUserId },
    });
    if (count === 0) {
      throw new NotFoundException('Env var not found');
    }

    await this.audit.log({
      userId: actorUserId,
      action: 'env-var.delete',
      resource: 'env-var',
      resourceId: id,
      metadata: { scope },
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
