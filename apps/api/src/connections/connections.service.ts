import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ConnectionStatus, ConnectionType } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService, type EncryptedPayload } from '../crypto/crypto.service';
import { AuditLogService } from '../audit/audit-log.service';
import type { UpdateConnectionDto } from './dto/update-connection.dto';
import type { ConnectionResponseDto } from './dto/connection-response.dto';
import { ProviderHealthRegistry } from './health/provider-health.registry';
import type { ProviderHealthResult } from './health/provider-health.types';
import { decodeKeysetCursor } from '../common/pagination/cursor';
import { buildPage, keysetWhere, type Page } from '../common/pagination/paginate';
import { resolveLimit } from '../common/pagination/page-query.dto';
import type { PageRequest } from '../common/pagination/page-request';

const HEALTH_CHECK_TIMEOUT_MS = 5000;

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
  private readonly log = new Logger(ConnectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditLogService,
    private readonly health: ProviderHealthRegistry,
  ) {}

  async list(organizationId: string, page: PageRequest = {}): Promise<Page<ConnectionResponseDto>> {
    const limit = resolveLimit(page.limit);
    let where: Prisma.ConnectionWhereInput = { organizationId };
    if (page.cursor) {
      const cursor = decodeKeysetCursor(page.cursor);
      where = {
        AND: [
          { organizationId },
          keysetWhere('createdAt', 'desc', new Date(cursor.v as string), cursor.id),
        ],
      } as Prisma.ConnectionWhereInput;
    }

    const peeked = await this.prisma.connection.findMany({
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

  async findOne(organizationId: string, id: string): Promise<ConnectionResponseDto> {
    const row = await this.prisma.connection.findFirst({
      where: { id, organizationId },
      select: SAFE_SELECT,
    });
    if (!row) {
      throw new NotFoundException('Connection not found');
    }
    return row;
  }

  async update(
    organizationId: string,
    userId: string,
    id: string,
    dto: UpdateConnectionDto,
  ): Promise<ConnectionResponseDto> {
    const existing = await this.prisma.connection.findFirst({
      where: { id, organizationId },
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
      organizationId,
      action: 'connection.update',
      resource: 'connection',
      resourceId: id,
      metadata: { fields: Object.keys(data) },
    });

    return row;
  }

  async remove(organizationId: string, userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.connection.deleteMany({
      where: { id, organizationId },
    });
    if (count === 0) {
      throw new NotFoundException('Connection not found');
    }

    await this.audit.log({
      userId,
      organizationId,
      action: 'connection.delete',
      resource: 'connection',
      resourceId: id,
    });
  }

  async create(
    organizationId: string,
    userId: string,
    input: CreateConnectionInput,
  ): Promise<ConnectionResponseDto> {
    const config = this.encryptConfig(input.config);
    const refreshToken = input.refreshToken ? this.crypto.encrypt(input.refreshToken) : null;

    const row = await this.prisma.connection.create({
      data: {
        organizationId,
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
      organizationId,
      action: 'connection.create',
      resource: 'connection',
      resourceId: row.id,
      metadata: { type: input.type, provider: input.provider, name: input.name },
    });

    return row;
  }

  async test(
    organizationId: string,
    userId: string,
    connectionId: string,
  ): Promise<ProviderHealthResult> {
    const row = await this.prisma.connection.findFirst({
      where: { id: connectionId, organizationId },
    });
    if (!row) {
      throw new NotFoundException('Connection not found');
    }

    const config = this.decryptConfig(row.configEncrypted, row.configNonce);
    const checker = this.health.get(row.provider);

    const signal = AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS);
    const result = await checker.check(config, signal);

    if (result.ok) {
      await this.prisma.connection.update({
        where: { id: connectionId },
        data: { lastUsedAt: new Date() },
      });
    }

    this.log.log(
      {
        userId,
        connectionId,
        provider: row.provider,
        ok: result.ok,
        latencyMs: result.latencyMs,
      },
      'Connection health check completed',
    );

    return result;
  }

  encryptConfig(config: object): EncryptedPayload {
    return this.crypto.encrypt(JSON.stringify(config));
  }

  decryptConfig(ciphertext: string, nonce: string): unknown {
    return JSON.parse(this.crypto.decrypt(ciphertext, nonce));
  }
}
