import sodium from 'libsodium-wrappers';
import { PrismaSecretResolver } from './prisma-secret-resolver';
import { SecretNotFoundError } from './secret-resolver';
import { CryptoCore } from '@tietide/crypto';

interface PrismaMock {
  workflowExecution: { findUnique: jest.Mock };
  secret: { findFirst: jest.Mock };
}

describe('PrismaSecretResolver', () => {
  let prisma: PrismaMock;
  let crypto: CryptoCore;
  let cryptoService: { decrypt: jest.Mock };
  let resolver: PrismaSecretResolver;

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
      secret: { findFirst: jest.fn() },
    };

    resolver = new PrismaSecretResolver(prisma as never, cryptoService as never);
  });

  const seedSecret = (organizationId: string, name: string, plaintext: string) => {
    const { ciphertext, nonce } = crypto.encrypt(plaintext);
    return { id: `sec-${name}`, organizationId, name, value: ciphertext, nonce };
  };

  describe('getSecret', () => {
    it('should return the decrypted value when the secret exists for the execution org', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { organizationId: 'org-A' },
      });
      prisma.secret.findFirst.mockResolvedValue(seedSecret('org-A', 'STRIPE_KEY', 'sk_live_xyz'));

      const value = await resolver.getSecret('exec-1', 'STRIPE_KEY');

      expect(value).toBe('sk_live_xyz');
      expect(prisma.secret.findFirst).toHaveBeenCalledWith({
        where: { organizationId: 'org-A', name: 'STRIPE_KEY' },
      });
    });

    it('should throw SecretNotFoundError when the secret does not exist for the execution org', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { organizationId: 'org-A' },
      });
      prisma.secret.findFirst.mockResolvedValue(null);

      await expect(resolver.getSecret('exec-1', 'MISSING')).rejects.toBeInstanceOf(
        SecretNotFoundError,
      );
      await expect(resolver.getSecret('exec-1', 'MISSING')).rejects.toThrow(/MISSING/);
    });

    it('should throw when the execution does not exist', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue(null);

      await expect(resolver.getSecret('exec-missing', 'X')).rejects.toThrow(/execution/i);
      expect(prisma.secret.findFirst).not.toHaveBeenCalled();
    });

    it('should not return secrets owned by a different org (cross-org isolation)', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { organizationId: 'org-A' },
      });
      // Prisma findFirst with where:{organizationId:'org-A',name:'X'} returns null because the
      // secret belongs to org-B; we simulate that here.
      prisma.secret.findFirst.mockImplementation(
        ({ where }: { where: { organizationId: string } }) =>
          Promise.resolve(
            where.organizationId === 'org-A' ? null : seedSecret('org-B', 'X', 'leaked'),
          ),
      );

      await expect(resolver.getSecret('exec-1', 'X')).rejects.toBeInstanceOf(SecretNotFoundError);
    });

    it('should hit Prisma only once per (executionId, name) within an execution (cache hit)', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { organizationId: 'org-A' },
      });
      prisma.secret.findFirst.mockResolvedValue(seedSecret('org-A', 'API_KEY', 'value-1'));

      await resolver.getSecret('exec-1', 'API_KEY');
      await resolver.getSecret('exec-1', 'API_KEY');

      expect(prisma.workflowExecution.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.secret.findFirst).toHaveBeenCalledTimes(1);
      expect(cryptoService.decrypt).toHaveBeenCalledTimes(1);
    });

    it('should resolve organizationId once and reuse it for different secret names within an execution', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { organizationId: 'org-A' },
      });
      prisma.secret.findFirst
        .mockResolvedValueOnce(seedSecret('org-A', 'A', 'aaa'))
        .mockResolvedValueOnce(seedSecret('org-A', 'B', 'bbb'));

      const a = await resolver.getSecret('exec-1', 'A');
      const b = await resolver.getSecret('exec-1', 'B');

      expect(a).toBe('aaa');
      expect(b).toBe('bbb');
      expect(prisma.workflowExecution.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.secret.findFirst).toHaveBeenCalledTimes(2);
    });

    it('should keep caches isolated between different executions', async () => {
      prisma.workflowExecution.findUnique
        .mockResolvedValueOnce({ id: 'exec-1', workflow: { organizationId: 'org-A' } })
        .mockResolvedValueOnce({ id: 'exec-2', workflow: { organizationId: 'org-B' } });
      prisma.secret.findFirst
        .mockResolvedValueOnce(seedSecret('org-A', 'KEY', 'value-A'))
        .mockResolvedValueOnce(seedSecret('org-B', 'KEY', 'value-B'));

      const a = await resolver.getSecret('exec-1', 'KEY');
      const b = await resolver.getSecret('exec-2', 'KEY');

      expect(a).toBe('value-A');
      expect(b).toBe('value-B');
      expect(prisma.workflowExecution.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('releaseExecution', () => {
    it('should drop the cache for that execution so subsequent getSecret re-hits Prisma', async () => {
      prisma.workflowExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        workflow: { organizationId: 'org-A' },
      });
      prisma.secret.findFirst.mockResolvedValue(seedSecret('org-A', 'X', 'val'));

      await resolver.getSecret('exec-1', 'X');
      resolver.releaseExecution('exec-1');
      await resolver.getSecret('exec-1', 'X');

      expect(prisma.workflowExecution.findUnique).toHaveBeenCalledTimes(2);
      expect(prisma.secret.findFirst).toHaveBeenCalledTimes(2);
    });

    it('should be a no-op when called for an unknown execution', () => {
      expect(() => resolver.releaseExecution('never-seen')).not.toThrow();
    });
  });
});
