import type { CryptoService, EncryptedPayload } from '../../crypto/crypto.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { InProcessRefreshService } from './in-process-refresh.service';

describe('InProcessRefreshService', () => {
  let prisma: {
    connection: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let crypto: jest.Mocked<Pick<CryptoService, 'encrypt' | 'decrypt'>>;
  let service: InProcessRefreshService;

  beforeEach(() => {
    prisma = {
      connection: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    crypto = {
      encrypt: jest.fn(
        (plain: string): EncryptedPayload => ({
          ciphertext: `enc(${plain})`,
          nonce: `n(${plain})`,
        }),
      ),
      decrypt: jest.fn((cipher: string, _nonce: string) => cipher.replace(/^enc\(|\)$/g, '')),
    } as unknown as jest.Mocked<Pick<CryptoService, 'encrypt' | 'decrypt'>>;

    service = new InProcessRefreshService(
      prisma as unknown as PrismaService,
      crypto as unknown as CryptoService,
    );
  });

  describe('persistGoogleTokens', () => {
    it('returns false and does not write when the connection no longer exists', async () => {
      prisma.connection.findUnique.mockResolvedValue(null);

      const result = await service.persistGoogleTokens('conn-missing', {
        accessToken: 'at-new',
      });

      expect(result).toBe(false);
      expect(prisma.connection.update).not.toHaveBeenCalled();
    });

    it('is idempotent: returns false and does not write when accessToken matches stored', async () => {
      const storedConfig = { accessToken: 'at-same', scope: 'gmail.send' };
      prisma.connection.findUnique.mockResolvedValue({
        id: 'conn-1',
        configEncrypted: `enc(${JSON.stringify(storedConfig)})`,
        configNonce: 'n',
        refreshTokenEncrypted: 'enc(rt)',
        refreshTokenNonce: 'n(rt)',
        expiresAt: new Date('2026-06-01T00:00:00Z'),
      });

      const result = await service.persistGoogleTokens('conn-1', {
        accessToken: 'at-same',
        scope: 'gmail.send',
      });

      expect(result).toBe(false);
      expect(prisma.connection.update).not.toHaveBeenCalled();
    });

    it('updates accessToken + scope, resets failure count, sets status ACTIVE on rotate', async () => {
      const storedConfig = { accessToken: 'at-old', scope: 'gmail.send', tokenType: 'Bearer' };
      prisma.connection.findUnique.mockResolvedValue({
        id: 'conn-1',
        configEncrypted: `enc(${JSON.stringify(storedConfig)})`,
        configNonce: 'n',
        refreshTokenEncrypted: 'enc(rt-old)',
        refreshTokenNonce: 'n(rt-old)',
        expiresAt: new Date('2026-06-01T00:00:00Z'),
      });

      const newExpiry = new Date('2026-06-01T01:00:00Z');
      const result = await service.persistGoogleTokens('conn-1', {
        accessToken: 'at-new',
        scope: 'gmail.send https://www.googleapis.com/auth/drive.file',
        expiresAt: newExpiry,
      });

      expect(result).toBe(true);
      expect(prisma.connection.update).toHaveBeenCalledTimes(1);
      const writeArg = prisma.connection.update.mock.calls[0][0];
      expect(writeArg.where).toEqual({ id: 'conn-1' });
      expect(writeArg.data.status).toBe('ACTIVE');
      expect(writeArg.data.refreshFailureCount).toBe(0);
      expect(writeArg.data.expiresAt).toEqual(newExpiry);
      // Re-encrypted config payload contains the new accessToken + scope.
      const reencryptedPayload = (writeArg.data.configEncrypted as string).replace(
        /^enc\(|\)$/g,
        '',
      );
      const persisted = JSON.parse(reencryptedPayload);
      expect(persisted).toEqual({
        accessToken: 'at-new',
        scope: 'gmail.send https://www.googleapis.com/auth/drive.file',
        tokenType: 'Bearer',
      });
    });

    it('rotates the refresh token when a new one is provided', async () => {
      const storedConfig = { accessToken: 'at-old' };
      prisma.connection.findUnique.mockResolvedValue({
        id: 'conn-1',
        configEncrypted: `enc(${JSON.stringify(storedConfig)})`,
        configNonce: 'n',
        refreshTokenEncrypted: 'enc(rt-old)',
        refreshTokenNonce: 'n(rt-old)',
        expiresAt: null,
      });

      const result = await service.persistGoogleTokens('conn-1', {
        accessToken: 'at-new',
        refreshToken: 'rt-new',
      });

      expect(result).toBe(true);
      const writeArg = prisma.connection.update.mock.calls[0][0];
      expect(writeArg.data.refreshTokenEncrypted).toBe('enc(rt-new)');
      expect(writeArg.data.refreshTokenNonce).toBe('n(rt-new)');
    });

    it('preserves the existing refresh token when none is provided', async () => {
      const storedConfig = { accessToken: 'at-old' };
      prisma.connection.findUnique.mockResolvedValue({
        id: 'conn-1',
        configEncrypted: `enc(${JSON.stringify(storedConfig)})`,
        configNonce: 'n',
        refreshTokenEncrypted: 'enc(rt-keep)',
        refreshTokenNonce: 'n(rt-keep)',
        expiresAt: null,
      });

      await service.persistGoogleTokens('conn-1', { accessToken: 'at-new' });

      const writeArg = prisma.connection.update.mock.calls[0][0];
      expect(writeArg.data.refreshTokenEncrypted).toBe('enc(rt-keep)');
      expect(writeArg.data.refreshTokenNonce).toBe('n(rt-keep)');
    });
  });
});
