import { Injectable, Logger as NestLogger } from '@nestjs/common';
import type { DecryptedConnection } from '@tietide/sdk';
import { PROVIDER_CONFIG_SCHEMAS } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { OAuthRefreshClient } from './refresh/oauth-refresh.client';
import { ConnectionNotFoundError, type ConnectionResolver } from './connection-resolver';

interface ExecutionCache {
  organizationId: string;
  connections: Map<string, DecryptedConnection>;
}

interface ConnectionRow {
  id: string;
  type: string;
  provider: string;
  status: string;
  refreshFailureCount: number;
  updatedAt: Date;
  configEncrypted: string;
  configNonce: string;
  refreshTokenEncrypted: string | null;
  refreshTokenNonce: string | null;
}

/**
 * Maximum number of consecutive inline OAuth refresh failures before the
 * resolver stops calling the provider's token endpoint (W5.12). A connection
 * whose `refreshFailureCount` has reached this cap holds a credential the
 * provider has already rejected repeatedly — retrying only hammers the
 * provider with a known-bad refresh token and risks a token-endpoint ban. The
 * connection must be reconnected manually (the OAuth refresh-scan / reconnect
 * flow resets the counter).
 */
export const MAX_INLINE_REFRESH_FAILURES = 5;

/**
 * Minimum wait, in milliseconds, between two inline refresh attempts for the
 * same connection once it has at least one recorded failure (W5.12). Gated on
 * the row's `updatedAt`, which is bumped whenever the refresh-failure counter
 * is written. Prevents a tight bad-token loop within a single execution / a
 * burst of executions from spamming the provider.
 */
export const INLINE_REFRESH_BACKOFF_MS = 60_000;

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
      where: { id: connectionId, organizationId: entry.organizationId },
    })) as ConnectionRow | null;

    if (!row) {
      throw new ConnectionNotFoundError(connectionId);
    }

    // W5.12: never hand a known-bad credential to a node. A non-ACTIVE
    // connection (EXPIRED after a failed refresh, or ERROR) has been rejected
    // by the provider already — running the node with it would throw a 401/403
    // and re-enter the refresh-and-retry loop against the provider on every
    // execution. Fail fast and direct the user to reconnect instead. Decrypt
    // is intentionally skipped so we don't touch dead credential material.
    if (row.status !== 'ACTIVE') {
      throw new Error(
        `Connection "${connectionId}" is ${row.status} — reconnect it before this workflow can use it`,
      );
    }

    const decrypted = this.decrypt<TConfig>(row);
    entry.connections.set(connectionId, decrypted as DecryptedConnection);

    this.log.log(
      { executionId, organizationId: entry.organizationId, connectionId, provider: row.provider },
      'connection.read',
    );

    return decrypted;
  }

  async markForRefresh(executionId: string, connectionId: string): Promise<void> {
    const entry = await this.loadExecution(executionId);

    await this.prisma.connection.updateMany({
      where: { id: connectionId, organizationId: entry.organizationId },
      data: {
        status: 'EXPIRED',
        refreshFailureCount: { increment: 1 },
      },
    });

    entry.connections.delete(connectionId);

    this.log.warn(
      { executionId, organizationId: entry.organizationId, connectionId },
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
      where: { id: connectionId, organizationId: entry.organizationId },
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

    // W5.12: honor the lockout counter. Once a connection has failed to refresh
    // `MAX_INLINE_REFRESH_FAILURES` times, stop calling the provider's token
    // endpoint — the stored refresh_token is bad and only a manual reconnect
    // will fix it. Retrying just spams the provider with a known-bad token.
    if (row.refreshFailureCount >= MAX_INLINE_REFRESH_FAILURES) {
      this.log.warn(
        { executionId, connectionId, provider: row.provider, failures: row.refreshFailureCount },
        'connection.refresh.locked_out',
      );
      throw new Error(
        `Connection "${connectionId}" has failed to refresh too many times (${row.refreshFailureCount}); reconnect it before retrying`,
      );
    }

    // W5.12: backoff gate. After at least one recorded failure, require a
    // minimum wait before the next provider call so a burst of executions
    // can't tight-loop against the token endpoint. `updatedAt` is bumped on
    // every failure write (markForRefresh) and on success.
    if (row.refreshFailureCount > 0) {
      const sinceLastWriteMs = Date.now() - new Date(row.updatedAt).getTime();
      if (sinceLastWriteMs < INLINE_REFRESH_BACKOFF_MS) {
        this.log.warn(
          {
            executionId,
            connectionId,
            provider: row.provider,
            sinceLastWriteMs,
            backoffMs: INLINE_REFRESH_BACKOFF_MS,
          },
          'connection.refresh.backoff',
        );
        throw new Error(
          `Connection "${connectionId}" was refreshed too soon after a recent failure; backoff in effect, wait before retrying`,
        );
      }
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
      const e = refreshErr as Error & { response?: { status?: number } };
      // Log only the upstream HTTP status, NEVER the raw `e.response`: an OAuth
      // provider's error response carries request/response headers (the bearer/
      // refresh token, client secret) and possibly token material in the body.
      this.log.warn(
        {
          executionId,
          connectionId,
          provider: row.provider,
          errName: e.name,
          errMessage: e.message,
          errStatus: e.response?.status ?? null,
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
      { executionId, organizationId: entry.organizationId, connectionId, provider: row.provider },
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
      include: { workflow: { select: { organizationId: true } } },
    });

    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    const entry: ExecutionCache = {
      organizationId: execution.workflow.organizationId,
      connections: new Map(),
    };
    this.cache.set(executionId, entry);
    return entry;
  }
}
