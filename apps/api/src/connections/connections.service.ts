import { Injectable, NotFoundException } from '@nestjs/common';
import type { ConnectionStatus, ConnectionType } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService, type EncryptedPayload } from '../crypto/crypto.service';
import { AuditLogService } from '../audit/audit-log.service';
import type { UpdateConnectionDto } from './dto/update-connection.dto';
import type { ConnectionResponseDto } from './dto/connection-response.dto';

const SAFE_SELECT = {
  id: true,
  type: true,
  provider: true,
  name: true,
  status: true,
  expiresAt: true,
  lastUsedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface CreateConnectionInput {
  type: ConnectionType;
  provider: string;
  name: string;
  config: object;
  refreshToken?: string;
  expiresAt?: Date | null;
}

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditLogService,
  ) {}

  async list(userId: string): Promise<ConnectionResponseDto[]> {
    return this.prisma.connection.findMany({
      where: { userId },
      select: SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string): Promise<ConnectionResponseDto> {
    const row = await this.prisma.connection.findFirst({
      where: { id, userId },
      select: SAFE_SELECT,
    });
    if (!row) {
      throw new NotFoundException('Connection not found');
    }
    return row;
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateConnectionDto,
  ): Promise<ConnectionResponseDto> {
    const existing = await this.prisma.connection.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Connection not found');
    }

    const data: { name?: string; status?: ConnectionStatus } = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.status !== undefined) {
      data.status = dto.status;
    }

    const row = await this.prisma.connection.update({
      where: { id },
      data,
      select: SAFE_SELECT,
    });

    await this.audit.log({
      userId,
      action: 'connection.update',
      resource: 'connection',
      resourceId: id,
      metadata: { fields: Object.keys(data) },
    });

    return row;
  }

  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.connection.deleteMany({
      where: { id, userId },
    });
    if (count === 0) {
      throw new NotFoundException('Connection not found');
    }

    await this.audit.log({
      userId,
      action: 'connection.delete',
      resource: 'connection',
      resourceId: id,
    });
  }

  async create(userId: string, input: CreateConnectionInput): Promise<ConnectionResponseDto> {
    const config = this.encryptConfig(input.config);
    const refreshToken = input.refreshToken ? this.crypto.encrypt(input.refreshToken) : null;

    const row = await this.prisma.connection.create({
      data: {
        userId,
        type: input.type,
        provider: input.provider,
        name: input.name,
        configEncrypted: config.ciphertext,
        configNonce: config.nonce,
        refreshTokenEncrypted: refreshToken?.ciphertext ?? null,
        refreshTokenNonce: refreshToken?.nonce ?? null,
        expiresAt: input.expiresAt ?? null,
      },
      select: SAFE_SELECT,
    });

    await this.audit.log({
      userId,
      action: 'connection.create',
      resource: 'connection',
      resourceId: row.id,
      metadata: { type: input.type, provider: input.provider, name: input.name },
    });

    return row;
  }

  encryptConfig(config: object): EncryptedPayload {
    return this.crypto.encrypt(JSON.stringify(config));
  }

  decryptConfig(ciphertext: string, nonce: string): unknown {
    return JSON.parse(this.crypto.decrypt(ciphertext, nonce));
  }
}
