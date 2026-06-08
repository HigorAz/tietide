import type { Job } from 'bullmq';
import type { CryptoService, EncryptedPayload } from '../../crypto/crypto.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { OAuthRefreshOneProcessor } from './oauth-refresh-one.processor';
import { OAuthRefreshClient } from './oauth-refresh.client';
import { OAuthRefreshDlqService } from './oauth-refresh-dlq.service';
import { OAUTH_REFRESH_ONE_JOB } from './oauth-refresh.constants';

const FROZEN_NOW = new Date('2026-05-06T12:00:00Z');

describe('OAuthRefreshOneProcessor', () => {
  let prisma: {
    connection: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let crypto: jest.Mocked<Pick<CryptoService, 'encrypt' | 'decrypt'>>;
  let client: jest.Mocked<Pick<OAuthRefreshClient, 'refresh' | 'supports'>>;
  let dlq: jest.Mocked<Pick<OAuthRefreshDlqService, 'publishFailed'>>;
  let processor: OAuthRefreshOneProcessor;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FROZEN_NOW);

    prisma = {
      connection: {
        findUnique: jest.fn(),
        update: jest.fn(),
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

    client = {
      refresh: jest.fn(),
      supports: jest.fn().mockReturnValue(true),
    } as jest.Mocked<Pick<OAuthRefreshClient, 'refresh' | 'supports'>>;

    dlq = {
      publishFailed: jest.fn().mockResolvedValue(undefined),
    } as jest.Mocked<Pick<OAuthRefreshDlqService, 'publishFailed'>>;

    processor = new OAuthRefreshOneProcessor(
      prisma as unknown as PrismaService,
      crypto as unknown as CryptoService,
      client as unknown as OAuthRefreshClient,
      dlq as unknown as OAuthRefreshDlqService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function makeJob(overrides: Partial<Job> = {}): Job {
    const base = {
      id: 'job-1',
      name: OAUTH_REFRESH_ONE_JOB,
      data: { connectionId: 'c1', provider: 'google' },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };
    return { ...base, ...overrides } as unknown as Job;
  }

  describe('process (happy path)', () => {
    it('decrypts → refreshes → re-encrypts → updates connection with status=ACTIVE and counter reset', async () => {
      prisma.connection.findUnique.mockResolvedValue({
        id: 'c1',
        organizationId: 'org-1',
        provider: 'google',
        configEncrypted:
          'enc({"accessToken":"old","refreshToken":"rt","scope":"s","tokenType":"Bearer"})',
        configNonce: 'cn',
        refreshTokenEncrypted: 'enc(rt-1)',
        refreshTokenNonce: 'rn',
        expiresAt: new Date('2026-05-06T12:01:00Z'),
        status: 'ACTIVE',
      });
      const newExpiresAt = new Date('2026-05-06T13:00:00Z');
      client.refresh.mockResolvedValue({
        config: { accessToken: 'new-a', refreshToken: 'rt-1', scope: 's', tokenType: 'Bearer' },
        refreshToken: 'rt-1',
        expiresAt: newExpiresAt,
      });

      const result = await processor.process(makeJob());

      expect(result).toEqual({ refreshed: true });
      expect(client.refresh).toHaveBeenCalledWith(
        'google',
        'rt-1',
        expect.objectContaining({ accessToken: 'old' }),
      );
      expect(prisma.connection.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: expect.objectContaining({
          status: 'ACTIVE',
          refreshFailureCount: 0,
          expiresAt: newExpiresAt,
          lastUsedAt: expect.any(Date),
        }),
      });
    });

    it('returns { refreshed: false } when the connection is missing', async () => {
      prisma.connection.findUnique.mockResolvedValue(null);
      const result = await processor.process(makeJob());
      expect(result).toEqual({ refreshed: false });
      expect(client.refresh).not.toHaveBeenCalled();
    });

    it('returns early without refreshing if the provider does not support refresh', async () => {
      prisma.connection.findUnique.mockResolvedValue({
        id: 'c1',
        provider: 'slack',
        configEncrypted: 'enc({})',
        configNonce: 'cn',
        refreshTokenEncrypted: 'enc(rt)',
        refreshTokenNonce: 'rn',
      });
      client.supports.mockReturnValue(false);

      const result = await processor.process(makeJob());
      expect(result).toEqual({ refreshed: false });
      expect(client.refresh).not.toHaveBeenCalled();
    });
  });

  describe('process (failure)', () => {
    it('rethrows the underlying error so BullMQ retries', async () => {
      prisma.connection.findUnique.mockResolvedValue({
        id: 'c1',
        provider: 'google',
        configEncrypted: 'enc({})',
        configNonce: 'cn',
        refreshTokenEncrypted: 'enc(rt)',
        refreshTokenNonce: 'rn',
      });
      client.refresh.mockRejectedValue(new Error('boom'));

      await expect(processor.process(makeJob())).rejects.toThrow('boom');
    });
  });

  describe('onFailed', () => {
    it('does nothing when retries remain', async () => {
      const job = makeJob({ attemptsMade: 1, opts: { attempts: 3 } as never });

      await processor.onFailed(job, new Error('flake'));

      expect(prisma.connection.update).not.toHaveBeenCalled();
      expect(dlq.publishFailed).not.toHaveBeenCalled();
    });

    it('after final failure with previous count 0 → status=ERROR (count=1) + DLQ publish', async () => {
      prisma.connection.update
        .mockResolvedValueOnce({ refreshFailureCount: 1, organizationId: 'org-1' })
        .mockResolvedValueOnce({});

      const job = makeJob({ attemptsMade: 3, opts: { attempts: 3 } as never });

      await processor.onFailed(job, new Error('boom'));

      expect(prisma.connection.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'c1' },
        data: { refreshFailureCount: { increment: 1 } },
        select: { refreshFailureCount: true, organizationId: true },
      });
      expect(prisma.connection.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'c1' },
        data: { status: 'ERROR' },
      });
      expect(dlq.publishFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            connectionId: 'c1',
            provider: 'google',
            organizationId: 'org-1',
          }),
          failureCount: 1,
        }),
      );
    });

    it('after final failure with count reaching 3 → status=EXPIRED + DLQ publish', async () => {
      prisma.connection.update
        .mockResolvedValueOnce({ refreshFailureCount: 3, organizationId: 'org-1' })
        .mockResolvedValueOnce({});

      const job = makeJob({ attemptsMade: 3, opts: { attempts: 3 } as never });

      await processor.onFailed(job, new Error('boom'));

      expect(prisma.connection.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'c1' },
        data: { status: 'EXPIRED' },
      });
      expect(dlq.publishFailed).toHaveBeenCalledWith(expect.objectContaining({ failureCount: 3 }));
    });
  });
});
