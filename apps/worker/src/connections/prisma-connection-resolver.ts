import { Injectable, Logger as NestLogger } from '@nestjs/common';
import type { DecryptedConnection } from '@tietide/sdk';
import { PROVIDER_CONFIG_SCHEMAS } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
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
