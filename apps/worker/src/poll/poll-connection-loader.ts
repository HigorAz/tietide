import { Injectable, Logger as NestLogger } from '@nestjs/common';
import type { DecryptedConnection } from '@tietide/sdk';
import { PROVIDER_CONFIG_SCHEMAS } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';

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
export class PollConnectionLoader {
  private readonly log = new NestLogger(PollConnectionLoader.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async load<TConfig = Record<string, unknown>>(
    userId: string,
    connectionId: string,
  ): Promise<DecryptedConnection<TConfig> | null> {
    const row = (await this.prisma.connection.findFirst({
      where: { id: connectionId, userId },
    })) as ConnectionRow | null;
    if (!row) {
      this.log.warn({ userId, connectionId }, 'connection.not_found_for_poll');
      return null;
    }

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
}
