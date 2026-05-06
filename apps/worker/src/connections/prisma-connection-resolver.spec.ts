import sodium from 'libsodium-wrappers';
import { CryptoCore } from '@tietide/crypto';
import { PrismaConnectionResolver } from './prisma-connection-resolver';
import { ConnectionNotFoundError } from './connection-resolver';

interface PrismaMock {
  workflowExecution: { findUnique: jest.Mock };
  connection: { findFirst: jest.Mock; updateMany: jest.Mock };
}

const validGoogleConfig = (overrides: Record<string, unknown> = {}) => ({
  accessToken: 'access-token-xyz',
  refreshToken: 'refresh-token-abc',
  scope: 'profile email',
  tokenType: 'Bearer',
  ...overrides,
});

describe('PrismaConnectionResolver', () => {
  let prisma: PrismaMock;
  let crypto: CryptoCore;
  let cryptoService: { decrypt: jest.Mock };
  let resolver: PrismaConnectionResolver;

  beforeAll(async () => {
    await sodium.ready;
  });

  beforeEach(() => {
    const key = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES);
    crypto = new CryptoCore(key);

    cryptoService = {
      decrypt: jest.fn((ciphertext: string, nonce: string) => crypto.decrypt(ciphertext, nonce)),
    };

    prisma = {
      workflowExecution: { findUnique: jest.fn() },
      connection: {
        findFirst: jest.fn(),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };

    resolver = new PrismaConnectionResolver(prisma as never, cryptoService as never);
  });

  const seedConnection = (
    userId: string,
    id: string,
    provider: string,
    config: Record<string, unknown>,
    refreshTokenPlain?: string,
  ) => {
    const { ciphertext, nonce } = crypto.encrypt(JSON.stringify(config));
    const refresh = refreshTokenPlain ? crypto.encrypt(refreshTokenPlain) : null;
    return {
      id,
      userId,
      type: 'OAUTH2',
      provider,
      name: `conn-${id}`,
      status: 'ACTIVE',
      configEncrypted: ciphertext,
      configNonce: nonce,
      refreshTokenEncrypted: refresh?.ciphertext ?? null,
      refreshTokenNonce: refresh?.nonce ?? null,
    };
  };

  describe('getConnection', () => {
    it('returns decrypted config for owned connection', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { userId: 'user-A' },
      });
      const cfg = validGoogleConfig();
      prisma.connection.findFirst.mockResolvedValue(
        seedConnection('user-A', 'conn-1', 'google', cfg),
      );

      const conn = await resolver.getConnection('exec-1', 'conn-1');

      expect(conn.id).toBe('conn-1');
      expect(conn.provider).toBe('google');
      expect(conn.config).toEqual(cfg);
      expect(prisma.connection.findFirst).toHaveBeenCalledWith({
        where: { id: 'conn-1', userId: 'user-A' },
      });
    });

    it('exposes the decrypted refresh token when present', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { userId: 'user-A' },
      });
      prisma.connection.findFirst.mockResolvedValue(
        seedConnection('user-A', 'conn-1', 'google', validGoogleConfig(), 'refresh-xyz'),
      );

      const conn = await resolver.getConnection('exec-1', 'conn-1');

      expect(conn.refreshToken).toBe('refresh-xyz');
    });

    it('omits refreshToken field when no refresh token is stored', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { userId: 'user-A' },
      });
      prisma.connection.findFirst.mockResolvedValue(
        seedConnection('user-A', 'conn-1', 'openai', { apiKey: 'sk-x' }),
      );

      const conn = await resolver.getConnection('exec-1', 'conn-1');

      expect(conn.refreshToken).toBeUndefined();
    });

    it('throws ConnectionNotFoundError when the connection is not owned by the executing user', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { userId: 'user-A' },
      });
      prisma.connection.findFirst.mockResolvedValue(null);

      await expect(resolver.getConnection('exec-1', 'conn-1')).rejects.toBeInstanceOf(
        ConnectionNotFoundError,
      );
    });

    it('throws when the execution does not exist', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue(null);

      await expect(resolver.getConnection('exec-missing', 'conn-1')).rejects.toThrow(/execution/i);
      expect(prisma.connection.findFirst).not.toHaveBeenCalled();
    });

    it('caches per (executionId, connectionId) — second call does not re-hit Prisma', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { userId: 'user-A' },
      });
      prisma.connection.findFirst.mockResolvedValue(
        seedConnection('user-A', 'conn-1', 'google', validGoogleConfig()),
      );

      await resolver.getConnection('exec-1', 'conn-1');
      await resolver.getConnection('exec-1', 'conn-1');

      expect(prisma.workflowExecution.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.connection.findFirst).toHaveBeenCalledTimes(1);
      expect(cryptoService.decrypt).toHaveBeenCalledTimes(1);
    });

    it('keeps caches isolated between different executions', async () => {
      prisma.workflowExecution.findUnique
        .mockResolvedValueOnce({ id: 'exec-1', workflow: { userId: 'user-A' } })
        .mockResolvedValueOnce({ id: 'exec-2', workflow: { userId: 'user-B' } });
      prisma.connection.findFirst
        .mockResolvedValueOnce(
          seedConnection('user-A', 'conn-1', 'google', validGoogleConfig({ accessToken: 'A' })),
        )
        .mockResolvedValueOnce(
          seedConnection('user-B', 'conn-1', 'google', validGoogleConfig({ accessToken: 'B' })),
        );

      const a = await resolver.getConnection('exec-1', 'conn-1');
      const b = await resolver.getConnection('exec-2', 'conn-1');

      expect((a.config as { accessToken: string }).accessToken).toBe('A');
      expect((b.config as { accessToken: string }).accessToken).toBe('B');
    });

    it('validates against PROVIDER_CONFIG_SCHEMAS for known providers and rejects malformed configs', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { userId: 'user-A' },
      });
      // 'google' schema requires accessToken/refreshToken/scope/tokenType — config missing these
      prisma.connection.findFirst.mockResolvedValue(
        seedConnection('user-A', 'conn-1', 'google', { accessToken: 'incomplete' }),
      );

      await expect(resolver.getConnection('exec-1', 'conn-1')).rejects.toThrow();
    });

    it('passes config through unchanged for unknown providers (no schema)', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { userId: 'user-A' },
      });
      prisma.connection.findFirst.mockResolvedValue(
        seedConnection('user-A', 'conn-1', 'custom-provider', { foo: 'bar', n: 1 }),
      );

      const conn = await resolver.getConnection('exec-1', 'conn-1');

      expect(conn.config).toEqual({ foo: 'bar', n: 1 });
    });
  });

  describe('markForRefresh', () => {
    it('sets status=EXPIRED and increments refreshFailureCount with ownership filter', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { userId: 'user-A' },
      });

      await resolver.markForRefresh('exec-1', 'conn-1');

      expect(prisma.connection.updateMany).toHaveBeenCalledWith({
        where: { id: 'conn-1', userId: 'user-A' },
        data: {
          status: 'EXPIRED',
          refreshFailureCount: { increment: 1 },
        },
      });
    });

    it('drops the connection from cache so the next getConnection re-decrypts fresh state', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { userId: 'user-A' },
      });
      prisma.connection.findFirst
        .mockResolvedValueOnce(
          seedConnection('user-A', 'conn-1', 'google', validGoogleConfig({ accessToken: 'v1' })),
        )
        .mockResolvedValueOnce(
          seedConnection('user-A', 'conn-1', 'google', validGoogleConfig({ accessToken: 'v2' })),
        );

      const first = await resolver.getConnection('exec-1', 'conn-1');
      await resolver.markForRefresh('exec-1', 'conn-1');
      const second = await resolver.getConnection('exec-1', 'conn-1');

      expect((first.config as { accessToken: string }).accessToken).toBe('v1');
      expect((second.config as { accessToken: string }).accessToken).toBe('v2');
      expect(prisma.connection.findFirst).toHaveBeenCalledTimes(2);
    });

    it('throws when the execution does not exist (no cross-user write path)', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue(null);

      await expect(resolver.markForRefresh('exec-missing', 'conn-1')).rejects.toThrow(/execution/i);
      expect(prisma.connection.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('releaseExecution', () => {
    it('drops the cache for that execution so subsequent getConnection re-hits Prisma', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { userId: 'user-A' },
      });
      prisma.connection.findFirst.mockResolvedValue(
        seedConnection('user-A', 'conn-1', 'google', validGoogleConfig()),
      );

      await resolver.getConnection('exec-1', 'conn-1');
      resolver.releaseExecution('exec-1');
      await resolver.getConnection('exec-1', 'conn-1');

      expect(prisma.workflowExecution.findUnique).toHaveBeenCalledTimes(2);
      expect(prisma.connection.findFirst).toHaveBeenCalledTimes(2);
    });

    it('is a no-op when called for an unknown execution', () => {
      expect(() => resolver.releaseExecution('never-seen')).not.toThrow();
    });
  });
});
