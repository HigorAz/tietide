import { Injectable, Logger as NestLogger } from '@nestjs/common';
import type { DecryptedConnection } from '@tietide/sdk';
import { PROVIDER_CONFIG_SCHEMAS } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { OAuthRefreshClient } from './refresh/oauth-refresh.client';
import { ConnectionNotFoundError, type ConnectionResolver } from './connection-resolver';

interface ExecutionCache {
  userId: string;
  connections: Map<string, DecryptedConnection>;
}

interface ConnectionRow {
  id: string;
  type: string;
  provider: string;
  configEncrypted: string;
  configNonce: string;
  refreshTokenEncrypted: string | null;
  refreshTokenNonce: string | null;
}

@Injectable()
export class PrismaConnectionResolver implements ConnectionResolver {
  private readonly log = new NestLogger(PrismaConnectionResolver.name);
  private readonly cache = new Map<string, ExecutionCache>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly oauthRefresh: OAuthRefreshClient,
  ) {}

  async getConnection<TConfig = Record<string, unknown>>(
    executionId: string,
    connectionId: string,
  ): Promise<DecryptedConnection<TConfig>> {
    const entry = await this.loadExecution(executionId);

    const cached = entry.connections.get(connectionId);
    if (cached !== undefined) {
      return cached as DecryptedConnection<TConfig>;
    }

    const row = (await this.prisma.connection.findFirst({
      where: { id: connectionId, userId: entry.userId },
    })) as ConnectionRow | null;

    if (!row) {
      throw new ConnectionNotFoundError(connectionId);
    }

    const decrypted = this.decrypt<TConfig>(row);
    entry.connections.set(connectionId, decrypted as DecryptedConnection);

    this.log.log(
      { executionId, userId: entry.userId, connectionId, provider: row.provider },
      'connection.read',
    );

    return decrypted;
  }

  async markForRefresh(executionId: string, connectionId: string): Promise<void> {
    const entry = await this.loadExecution(executionId);

    await this.prisma.connection.updateMany({
      where: { id: connectionId, userId: entry.userId },
      data: {
        status: 'EXPIRED',
        refreshFailureCount: { increment: 1 },
      },
    });

    entry.connections.delete(connectionId);

    this.log.warn(
      { executionId, userId: entry.userId, connectionId },
      'connection.marked_for_refresh',
    );
  }

  async refreshConnection<TConfig = Record<string, unknown>>(
    executionId: string,
    connectionId: string,
  ): Promise<DecryptedConnection<TConfig>> {
    this.log.warn({ executionId, connectionId }, 'connection.refresh.start');
    const entry = await this.loadExecution(executionId);

    const row = (await this.prisma.connection.findFirst({
      where: { id: connectionId, userId: entry.userId },
    })) as ConnectionRow | null;
    if (!row) {
      this.log.warn({ executionId, connectionId }, 'connection.refresh.not_found');
      throw new ConnectionNotFoundError(connectionId);
    }
    if (!this.oauthRefresh.supports(row.provider)) {
      this.log.warn(
        { executionId, connectionId, provider: row.provider },
        'connection.refresh.unsupported_provider',
      );
      throw new Error(`Provider "${row.provider}" does not support inline OAuth refresh`);
    }
    if (!row.refreshTokenEncrypted || !row.refreshTokenNonce) {
      this.log.warn(
        { executionId, connectionId, provider: row.provider },
        'connection.refresh.no_token',
      );
      throw new Error(`Connection "${connectionId}" has no stored refresh token`);
    }

    const currentConfigJson = this.crypto.decrypt(row.configEncrypted, row.configNonce);
    const currentConfig = JSON.parse(currentConfigJson) as Record<string, unknown>;
    const refreshTokenPlain = this.crypto.decrypt(row.refreshTokenEncrypted, row.refreshTokenNonce);

    this.log.warn(
      { executionId, connectionId, provider: row.provider },
      'connection.refresh.calling_provider',
    );
    let result;
    try {
      result = await this.oauthRefresh.refresh(row.provider, refreshTokenPlain, currentConfig);
    } catch (refreshErr) {
      const e = refreshErr as Error & { response?: unknown };
      this.log.warn(
        {
          executionId,
          connectionId,
          provider: row.provider,
          errName: e.name,
          errMessage: e.message,
          errResponse: e.response ?? null,
        },
        'connection.refresh.provider_error',
      );
      throw refreshErr;
    }

    const encryptedConfig = this.crypto.encrypt(JSON.stringify(result.config));
    const encryptedRefresh = this.crypto.encrypt(result.refreshToken);

    await this.prisma.connection.update({
      where: { id: connectionId },
      data: {
        configEncrypted: encryptedConfig.ciphertext,
        configNonce: encryptedConfig.nonce,
        refreshTokenEncrypted: encryptedRefresh.ciphertext,
        refreshTokenNonce: encryptedRefresh.nonce,
        expiresAt: result.expiresAt,
        status: 'ACTIVE',
        refreshFailureCount: 0,
        lastUsedAt: new Date(),
      },
    });

    // Validate the refreshed config against the per-provider schema before
    // handing it back to the node — the schemas are the same ones used by
    // `decrypt()` below, so we keep the in-memory cache shape consistent.
    const schema = PROVIDER_CONFIG_SCHEMAS[row.provider as keyof typeof PROVIDER_CONFIG_SCHEMAS];
    const validatedConfig = (
      schema ? (schema.parse(result.config) as Record<string, unknown>) : result.config
    ) as TConfig;

    const refreshed: DecryptedConnection<TConfig> = {
      id: row.id,
      type: row.type,
      provider: row.provider,
      config: validatedConfig,
      refreshToken: result.refreshToken,
    };
    entry.connections.set(connectionId, refreshed as DecryptedConnection);

    this.log.log(
      { executionId, userId: entry.userId, connectionId, provider: row.provider },
      'connection.refreshed',
    );

    return refreshed;
  }

  releaseExecution(executionId: string): void {
    this.cache.delete(executionId);
  }

  private decrypt<TConfig>(row: ConnectionRow): DecryptedConnection<TConfig> {
    const configJson = this.crypto.decrypt(row.configEncrypted, row.configNonce);
    const rawConfig = JSON.parse(configJson) as Record<string, unknown>;

    const schema = PROVIDER_CONFIG_SCHEMAS[row.provider as keyof typeof PROVIDER_CONFIG_SCHEMAS];
    const config = (
      schema ? (schema.parse(rawConfig) as Record<string, unknown>) : rawConfig
    ) as TConfig;

    const result: DecryptedConnection<TConfig> = {
      id: row.id,
      type: row.type,
      provider: row.provider,
      config,
    };

    if (row.refreshTokenEncrypted && row.refreshTokenNonce) {
      result.refreshToken = this.crypto.decrypt(row.refreshTokenEncrypted, row.refreshTokenNonce);
    }

    return result;
  }

  private async loadExecution(executionId: string): Promise<ExecutionCache> {
    const existing = this.cache.get(executionId);
    if (existing) {
      return existing;
    }

    const execution = await this.prisma.workflowExecution.findUnique({
      where: { id: executionId },
      include: { workflow: { select: { userId: true } } },
    });

    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    const entry: ExecutionCache = {
      userId: execution.workflow.userId,
      connections: new Map(),
    };
    this.cache.set(executionId, entry);
    return entry;
  }
}
