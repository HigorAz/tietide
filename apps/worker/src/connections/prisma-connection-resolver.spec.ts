import sodium from 'libsodium-wrappers';
import { CryptoCore } from '@tietide/crypto';
import {
  PrismaConnectionResolver,
  MAX_INLINE_REFRESH_FAILURES,
  INLINE_REFRESH_BACKOFF_MS,
} from './prisma-connection-resolver';
import { ConnectionNotFoundError } from './connection-resolver';

interface PrismaMock {
  workflowExecution: { findUnique: jest.Mock };
  connection: { findFirst: jest.Mock; updateMany: jest.Mock; update: jest.Mock };
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
  let cryptoService: { decrypt: jest.Mock; encrypt: jest.Mock };
  let resolver: PrismaConnectionResolver;
  let oauthRefreshStub: { supports: jest.Mock; refresh: jest.Mock };

  beforeAll(async () => {
    await sodium.ready;
  });

  beforeEach(() => {
    const key = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES);
    crypto = new CryptoCore(key);

    cryptoService = {
      decrypt: jest.fn((ciphertext: string, nonce: string) => crypto.decrypt(ciphertext, nonce)),
      encrypt: jest.fn((plaintext: string) => crypto.encrypt(plaintext)),
    };

    prisma = {
      workflowExecution: { findUnique: jest.fn() },
      connection: {
        findFirst: jest.fn(),
        updateMany: jest.fn(async () => ({ count: 1 })),
        update: jest.fn(async () => ({})),
      },
    };

    oauthRefreshStub = {
      supports: jest.fn(() => false),
      refresh: jest.fn(),
    };
    resolver = new PrismaConnectionResolver(
      prisma as never,
      cryptoService as never,
      oauthRefreshStub as never,
    );
  });

  const seedConnection = (
    organizationId: string,
    id: string,
    provider: string,
    config: Record<string, unknown>,
    refreshTokenPlain?: string,
    overrides: { status?: string; refreshFailureCount?: number; updatedAt?: Date } = {},
  ) => {
    const { ciphertext, nonce } = crypto.encrypt(JSON.stringify(config));
    const refresh = refreshTokenPlain ? crypto.encrypt(refreshTokenPlain) : null;
    return {
      id,
      organizationId,
      type: 'OAUTH2',
      provider,
      name: `conn-${id}`,
      status: overrides.status ?? 'ACTIVE',
      refreshFailureCount: overrides.refreshFailureCount ?? 0,
      updatedAt: overrides.updatedAt ?? new Date('2000-01-01T00:00:00Z'),
      configEncrypted: ciphertext,
      configNonce: nonce,
      refreshTokenEncrypted: refresh?.ciphertext ?? null,
      refreshTokenNonce: refresh?.nonce ?? null,
    };
  };

  describe('getConnection', () => {
    it('returns decrypted config for connection owned by the execution org', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { organizationId: 'org-A' },
      });
      const cfg = validGoogleConfig();
      prisma.connection.findFirst.mockResolvedValue(
        seedConnection('org-A', 'conn-1', 'google', cfg),
      );

      const conn = await resolver.getConnection('exec-1', 'conn-1');

      expect(conn.id).toBe('conn-1');
      expect(conn.provider).toBe('google');
      expect(conn.config).toEqual(cfg);
      expect(prisma.connection.findFirst).toHaveBeenCalledWith({
        where: { id: 'conn-1', organizationId: 'org-A' },
      });
    });

    it('exposes the decrypted refresh token when present', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { organizationId: 'org-A' },
      });
      prisma.connection.findFirst.mockResolvedValue(
        seedConnection('org-A', 'conn-1', 'google', validGoogleConfig(), 'refresh-xyz'),
      );

      const conn = await resolver.getConnection('exec-1', 'conn-1');

      expect(conn.refreshToken).toBe('refresh-xyz');
    });

    it('omits refreshToken field when no refresh token is stored', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { organizationId: 'org-A' },
      });
      prisma.connection.findFirst.mockResolvedValue(
        seedConnection('org-A', 'conn-1', 'openai', { apiKey: 'sk-x' }),
      );

      const conn = await resolver.getConnection('exec-1', 'conn-1');

      expect(conn.refreshToken).toBeUndefined();
    });

    it('throws ConnectionNotFoundError when the connection is not owned by the executing org', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { organizationId: 'org-A' },
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
        workflow: { organizationId: 'org-A' },
      });
      prisma.connection.findFirst.mockResolvedValue(
        seedConnection('org-A', 'conn-1', 'google', validGoogleConfig()),
      );

      await resolver.getConnection('exec-1', 'conn-1');
      await resolver.getConnection('exec-1', 'conn-1');

      expect(prisma.workflowExecution.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.connection.findFirst).toHaveBeenCalledTimes(1);
      expect(cryptoService.decrypt).toHaveBeenCalledTimes(1);
    });

    it('keeps caches isolated between different executions', async () => {
      prisma.workflowExecution.findUnique
        .mockResolvedValueOnce({ id: 'exec-1', workflow: { organizationId: 'org-A' } })
        .mockResolvedValueOnce({ id: 'exec-2', workflow: { organizationId: 'org-B' } });
      prisma.connection.findFirst
        .mockResolvedValueOnce(
          seedConnection('org-A', 'conn-1', 'google', validGoogleConfig({ accessToken: 'A' })),
        )
        .mockResolvedValueOnce(
          seedConnection('org-B', 'conn-1', 'google', validGoogleConfig({ accessToken: 'B' })),
        );

      const a = await resolver.getConnection('exec-1', 'conn-1');
      const b = await resolver.getConnection('exec-2', 'conn-1');

      expect((a.config as { accessToken: string }).accessToken).toBe('A');
      expect((b.config as { accessToken: string }).accessToken).toBe('B');
    });

    it('validates against PROVIDER_CONFIG_SCHEMAS for known providers and rejects malformed configs', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { organizationId: 'org-A' },
      });
      // 'google' schema requires accessToken/refreshToken/scope/tokenType — config missing these
      prisma.connection.findFirst.mockResolvedValue(
        seedConnection('org-A', 'conn-1', 'google', { accessToken: 'incomplete' }),
      );

      await expect(resolver.getConnection('exec-1', 'conn-1')).rejects.toThrow();
    });

    it('rejects an EXPIRED connection without decrypting it (W5.12 — no bad-token loop)', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { organizationId: 'org-A' },
      });
      prisma.connection.findFirst.mockResolvedValue(
        seedConnection('org-A', 'conn-1', 'google', validGoogleConfig(), 'refresh-xyz', {
          status: 'EXPIRED',
        }),
      );

      await expect(resolver.getConnection('exec-1', 'conn-1')).rejects.toThrow(
        /expired|reconnect/i,
      );
      // Must short-circuit before touching the decrypted credential.
      expect(cryptoService.decrypt).not.toHaveBeenCalled();
    });

    it('rejects an ERROR connection without decrypting it (W5.12)', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { organizationId: 'org-A' },
      });
      prisma.connection.findFirst.mockResolvedValue(
        seedConnection('org-A', 'conn-1', 'google', validGoogleConfig(), 'refresh-xyz', {
          status: 'ERROR',
        }),
      );

      await expect(resolver.getConnection('exec-1', 'conn-1')).rejects.toThrow();
      expect(cryptoService.decrypt).not.toHaveBeenCalled();
    });

    it('passes config through unchanged for unknown providers (no schema)', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { organizationId: 'org-A' },
      });
      prisma.connection.findFirst.mockResolvedValue(
        seedConnection('org-A', 'conn-1', 'custom-provider', { foo: 'bar', n: 1 }),
      );

      const conn = await resolver.getConnection('exec-1', 'conn-1');

      expect(conn.config).toEqual({ foo: 'bar', n: 1 });
    });
  });

  describe('markForRefresh', () => {
    it('sets status=EXPIRED and increments refreshFailureCount with org ownership filter', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { organizationId: 'org-A' },
      });

      await resolver.markForRefresh('exec-1', 'conn-1');

      expect(prisma.connection.updateMany).toHaveBeenCalledWith({
        where: { id: 'conn-1', organizationId: 'org-A' },
        data: {
          status: 'EXPIRED',
          refreshFailureCount: { increment: 1 },
        },
      });
    });

    it('drops the connection from cache so the next getConnection re-decrypts fresh state', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { organizationId: 'org-A' },
      });
      prisma.connection.findFirst
        .mockResolvedValueOnce(
          seedConnection('org-A', 'conn-1', 'google', validGoogleConfig({ accessToken: 'v1' })),
        )
        .mockResolvedValueOnce(
          seedConnection('org-A', 'conn-1', 'google', validGoogleConfig({ accessToken: 'v2' })),
        );

      const first = await resolver.getConnection('exec-1', 'conn-1');
      await resolver.markForRefresh('exec-1', 'conn-1');
      const second = await resolver.getConnection('exec-1', 'conn-1');

      expect((first.config as { accessToken: string }).accessToken).toBe('v1');
      expect((second.config as { accessToken: string }).accessToken).toBe('v2');
      expect(prisma.connection.findFirst).toHaveBeenCalledTimes(2);
    });

    it('throws when the execution does not exist (no cross-org write path)', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue(null);

      await expect(resolver.markForRefresh('exec-missing', 'conn-1')).rejects.toThrow(/execution/i);
      expect(prisma.connection.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('refreshConnection', () => {
    it('short-circuits at the failure cap WITHOUT calling the provider (W5.12 lockout)', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { organizationId: 'org-A' },
      });
      oauthRefreshStub.supports.mockReturnValue(true);
      prisma.connection.findFirst.mockResolvedValue(
        seedConnection('org-A', 'conn-1', 'google', validGoogleConfig(), 'refresh-xyz', {
          status: 'EXPIRED',
          refreshFailureCount: MAX_INLINE_REFRESH_FAILURES,
          // Old timestamp so the backoff gate is NOT the thing tripping here.
          updatedAt: new Date('2000-01-01T00:00:00Z'),
        }),
      );

      await expect(resolver.refreshConnection('exec-1', 'conn-1')).rejects.toThrow(
        /too many|lock|cap|failure/i,
      );
      expect(oauthRefreshStub.refresh).not.toHaveBeenCalled();
    });

    it('enforces a backoff gate after a recent failure WITHOUT calling the provider (W5.12)', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { organizationId: 'org-A' },
      });
      oauthRefreshStub.supports.mockReturnValue(true);
      prisma.connection.findFirst.mockResolvedValue(
        seedConnection('org-A', 'conn-1', 'google', validGoogleConfig(), 'refresh-xyz', {
          status: 'EXPIRED',
          refreshFailureCount: 1,
          // Failed just now → still inside the backoff window.
          updatedAt: new Date(Date.now() - INLINE_REFRESH_BACKOFF_MS / 2),
        }),
      );

      await expect(resolver.refreshConnection('exec-1', 'conn-1')).rejects.toThrow(
        /backoff|wait|too soon/i,
      );
      expect(oauthRefreshStub.refresh).not.toHaveBeenCalled();
    });

    it('proceeds to call the provider once the backoff window has elapsed and under the cap', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { organizationId: 'org-A' },
      });
      oauthRefreshStub.supports.mockReturnValue(true);
      oauthRefreshStub.refresh.mockResolvedValue({
        config: validGoogleConfig({ accessToken: 'fresh' }),
        refreshToken: 'refresh-new',
        expiresAt: new Date(Date.now() + 3600_000),
      });
      prisma.connection.findFirst.mockResolvedValue(
        seedConnection('org-A', 'conn-1', 'google', validGoogleConfig(), 'refresh-xyz', {
          status: 'EXPIRED',
          refreshFailureCount: 1,
          // Last failure is well outside the backoff window.
          updatedAt: new Date(Date.now() - INLINE_REFRESH_BACKOFF_MS * 2),
        }),
      );

      const refreshed = await resolver.refreshConnection('exec-1', 'conn-1');

      expect(oauthRefreshStub.refresh).toHaveBeenCalledTimes(1);
      expect((refreshed.config as { accessToken: string }).accessToken).toBe('fresh');
    });
  });

  describe('releaseExecution', () => {
    it('drops the cache for that execution so subsequent getConnection re-hits Prisma', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { organizationId: 'org-A' },
      });
      prisma.connection.findFirst.mockResolvedValue(
        seedConnection('org-A', 'conn-1', 'google', validGoogleConfig()),
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
