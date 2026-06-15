import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ConnectionStatus, ConnectionType, OllamaModelsResult } from '@tietide/shared';
import { PROVIDER_CONFIG_SCHEMAS } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService, type EncryptedPayload } from '../crypto/crypto.service';
import { AuditLogService } from '../audit/audit-log.service';
import type { UpdateConnectionDto } from './dto/update-connection.dto';
import type { ConnectionResponseDto } from './dto/connection-response.dto';
import { ProviderHealthRegistry } from './health/provider-health.registry';
import type { ProviderHealthResult } from './health/provider-health.types';
import { assertHealthUrlAllowed, SsrfBlockedError } from './health/ssrf-guard';
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

// Adds the owner id so the service can compute `canEdit` per row, then strips it
// before the row is returned (owner ids are never serialized to the client).
const SAFE_SELECT_WITH_OWNER = { ...SAFE_SELECT, userId: true } as const;

// A connection may be mutated only by its owner or a workspace SUPERADMIN.
function canEditConnection(ownerId: string, requesterId: string, role: string): boolean {
  return ownerId === requesterId || role === 'SUPERADMIN';
}

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

  async list(
    organizationId: string,
    requesterId: string,
    role: string,
    page: PageRequest = {},
  ): Promise<Page<ConnectionResponseDto>> {
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
      select: SAFE_SELECT_WITH_OWNER,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    return buildPage(
      peeked,
      limit,
      ({ userId, ...row }) => ({ ...row, canEdit: canEditConnection(userId, requesterId, role) }),
      (row) => ({ v: row.createdAt.toISOString(), id: row.id }),
    );
  }

  async findOne(
    organizationId: string,
    id: string,
    requesterId: string,
    role: string,
  ): Promise<ConnectionResponseDto> {
    const row = await this.prisma.connection.findFirst({
      where: { id, organizationId },
      select: SAFE_SELECT_WITH_OWNER,
    });
    if (!row) {
      throw new NotFoundException('Connection not found');
    }
    const { userId, ...rest } = row;
    return { ...rest, canEdit: canEditConnection(userId, requesterId, role) };
  }

  async update(
    organizationId: string,
    userId: string,
    role: string,
    id: string,
    dto: UpdateConnectionDto,
  ): Promise<ConnectionResponseDto> {
    const existing = await this.prisma.connection.findFirst({
      where: { id, organizationId },
      select: { id: true, userId: true, type: true, provider: true },
    });
    if (!existing) {
      throw new NotFoundException('Connection not found');
    }
    this.assertCanMutate(existing.userId, userId, role);

    const data: {
      name?: string;
      status?: ConnectionStatus;
      configEncrypted?: string;
      configNonce?: string;
    } = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.status !== undefined) {
      data.status = dto.status;
    }
    if (dto.config !== undefined) {
      // Editing raw OAuth tokens by hand is wrong — those connections are
      // refreshed by re-running the OAuth flow ("Reconnect"), not by pasting a
      // token. Only credential-style connections accept a config edit.
      if (existing.type === 'OAUTH2') {
        throw new BadRequestException(
          'Reconnect this connection to refresh its credentials (OAuth connections cannot be edited directly).',
        );
      }
      const schema =
        PROVIDER_CONFIG_SCHEMAS[existing.provider as keyof typeof PROVIDER_CONFIG_SCHEMAS];
      if (!schema) {
        throw new BadRequestException(
          `Provider "${existing.provider}" does not support config edits`,
        );
      }
      const parsed = schema.safeParse(dto.config);
      if (!parsed.success) {
        throw new BadRequestException(
          parsed.error.issues[0]?.message ?? 'Invalid connection config',
        );
      }
      const encrypted = this.encryptConfig(parsed.data);
      data.configEncrypted = encrypted.ciphertext;
      data.configNonce = encrypted.nonce;
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
      // Record WHICH fields changed, never their values. 'config' marks a
      // credential rotation without leaking the new secret.
      metadata: { fields: Object.keys(data) },
    });

    return { ...row, canEdit: true };
  }

  async remove(organizationId: string, userId: string, role: string, id: string): Promise<void> {
    const existing = await this.prisma.connection.findFirst({
      where: { id, organizationId },
      select: { id: true, userId: true },
    });
    if (!existing) {
      throw new NotFoundException('Connection not found');
    }
    this.assertCanMutate(existing.userId, userId, role);

    await this.prisma.connection.deleteMany({ where: { id, organizationId } });

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

  // Resolve the Ollama base URL from either a saved (owned) connection or an ad-hoc
  // baseUrl (the connection-create form, before a connection exists). Trailing slashes
  // trimmed so `${base}/api/...` joins cleanly.
  async resolveOllamaBaseUrl(
    organizationId: string,
    input: { connectionId?: string; baseUrl?: string },
  ): Promise<string> {
    if (input.connectionId) {
      const row = await this.prisma.connection.findFirst({
        where: { id: input.connectionId, organizationId, provider: 'ollama' },
      });
      if (!row) {
        throw new NotFoundException('Connection not found');
      }
      const cfg = this.decryptConfig(row.configEncrypted, row.configNonce) as { baseUrl?: unknown };
      if (typeof cfg.baseUrl !== 'string' || cfg.baseUrl.length === 0) {
        throw new BadRequestException('Connection has no baseUrl');
      }
      return cfg.baseUrl.replace(/\/+$/, '');
    }
    if (input.baseUrl && input.baseUrl.length > 0) {
      return input.baseUrl.replace(/\/+$/, '');
    }
    throw new BadRequestException('Provide a connectionId or baseUrl');
  }

  // List the models installed on an Ollama server (GET /api/tags). SSRF-guarded — a
  // private/loopback baseUrl needs the operator's SSRF_ALLOWED_HOSTS allowlist. Any
  // failure (SSRF block, unreachable, bad body) degrades to `reachable:false` so the UI
  // falls back to the curated model list instead of erroring.
  async listOllamaModels(
    organizationId: string,
    input: { connectionId?: string; baseUrl?: string },
  ): Promise<OllamaModelsResult> {
    const base = await this.resolveOllamaBaseUrl(organizationId, input);
    const url = `${base}/api/tags`;
    try {
      await assertHealthUrlAllowed(url);
    } catch (err) {
      if (err instanceof SsrfBlockedError) {
        return { models: [], reachable: false };
      }
      throw err;
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS) });
      if (!res.ok) {
        return { models: [], reachable: false };
      }
      const body = (await res.json()) as { models?: Array<{ name?: unknown }> };
      const names = (body.models ?? [])
        .map((m) => (typeof m?.name === 'string' ? m.name : null))
        .filter((n): n is string => n !== null && n.length > 0);
      return { models: [...new Set(names)].sort(), reachable: true };
    } catch {
      return { models: [], reachable: false };
    }
  }

  // Open a streaming Ollama model pull (POST /api/pull, stream:true). Resolves +
  // SSRF-guards the baseUrl, then returns the raw upstream fetch Response so the
  // controller can forward its NDJSON progress chunks to the client. SSRF-blocked hosts
  // throw BadRequest (the operator must allowlist them via SSRF_ALLOWED_HOSTS).
  async openOllamaPull(
    organizationId: string,
    input: { connectionId?: string; baseUrl?: string; model: string },
  ): Promise<Response> {
    const base = await this.resolveOllamaBaseUrl(organizationId, input);
    const url = `${base}/api/pull`;
    try {
      await assertHealthUrlAllowed(url);
    } catch (err) {
      if (err instanceof SsrfBlockedError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: input.model, stream: true }),
    });
  }

  // Enforce that a connection is mutated only by its owner or a SUPERADMIN.
  // Read/list stay org-wide; only update/delete are restricted.
  private assertCanMutate(ownerId: string, requesterId: string, role: string): void {
    if (!canEditConnection(ownerId, requesterId, role)) {
      throw new ForbiddenException('You can only edit connections you own');
    }
  }

  encryptConfig(config: object): EncryptedPayload {
    return this.crypto.encrypt(JSON.stringify(config));
  }

  decryptConfig(ciphertext: string, nonce: string): unknown {
    return JSON.parse(this.crypto.decrypt(ciphertext, nonce));
  }
}
