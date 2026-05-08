import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../crypto/crypto.service';

export interface RefreshedTokens {
  accessToken: string;
  refreshToken?: string | null;
  scope?: string | null;
  expiresAt?: Date | null;
}

/**
 * Persists tokens that were rotated in-process by an SDK (e.g., Google's
 * OAuth2Client `'tokens'` event). Idempotent on no-op: if the new accessToken
 * matches the stored one, the row is left untouched.
 *
 * Coexists with the API-side `OAuthRefreshOneProcessor` job-driven refresh.
 * Both paths converge on the same Connection row; idempotency keeps them
 * race-safe.
 */
@Injectable()
export class InProcessRefreshService {
  private readonly log = new Logger(InProcessRefreshService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async persistGoogleTokens(connectionId: string, tokens: RefreshedTokens): Promise<boolean> {
    const connection = await this.prisma.connection.findUnique({
      where: { id: connectionId },
    });
    if (!connection) {
      this.log.warn({ connectionId }, 'In-process refresh: connection vanished');
      return false;
    }

    const currentConfig = JSON.parse(
      this.crypto.decrypt(connection.configEncrypted, connection.configNonce),
    ) as Record<string, unknown>;

    if (currentConfig.accessToken === tokens.accessToken) {
      return false;
    }

    const nextConfig: Record<string, unknown> = {
      ...currentConfig,
      accessToken: tokens.accessToken,
    };
    if (typeof tokens.scope === 'string' && tokens.scope.length > 0) {
      nextConfig.scope = tokens.scope;
    }

    const encryptedConfig = this.crypto.encrypt(JSON.stringify(nextConfig));

    let encryptedRefreshCipher: string | null = connection.refreshTokenEncrypted;
    let encryptedRefreshNonce: string | null = connection.refreshTokenNonce;
    if (typeof tokens.refreshToken === 'string' && tokens.refreshToken.length > 0) {
      const enc = this.crypto.encrypt(tokens.refreshToken);
      encryptedRefreshCipher = enc.ciphertext;
      encryptedRefreshNonce = enc.nonce;
    }

    await this.prisma.connection.update({
      where: { id: connectionId },
      data: {
        configEncrypted: encryptedConfig.ciphertext,
        configNonce: encryptedConfig.nonce,
        refreshTokenEncrypted: encryptedRefreshCipher,
        refreshTokenNonce: encryptedRefreshNonce,
        expiresAt: tokens.expiresAt ?? connection.expiresAt,
        status: 'ACTIVE',
        refreshFailureCount: 0,
        lastUsedAt: new Date(),
      },
    });

    return true;
  }
}
