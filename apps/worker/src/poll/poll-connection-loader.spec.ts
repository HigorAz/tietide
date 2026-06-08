import sodium from 'libsodium-wrappers';
import { CryptoCore } from '@tietide/crypto';
import { PollConnectionLoader } from './poll-connection-loader';

interface PrismaMock {
  connection: { findFirst: jest.Mock };
}

describe('PollConnectionLoader', () => {
  let prisma: PrismaMock;
  let crypto: CryptoCore;
  let cryptoService: { decrypt: jest.Mock };
  let loader: PollConnectionLoader;

  beforeAll(async () => {
    await sodium.ready;
  });

  beforeEach(() => {
    const key = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES);
    crypto = new CryptoCore(key);
    cryptoService = {
      decrypt: jest.fn((ciphertext: string, nonce: string) => crypto.decrypt(ciphertext, nonce)),
    };
    prisma = { connection: { findFirst: jest.fn() } };
    loader = new PollConnectionLoader(prisma as never, cryptoService as never);
  });

  const seed = (organizationId: string, provider: string, config: Record<string, unknown>) => {
    const { ciphertext, nonce } = crypto.encrypt(JSON.stringify(config));
    return {
      id: 'conn-1',
      organizationId,
      type: 'OAUTH2',
      provider,
      configEncrypted: ciphertext,
      configNonce: nonce,
      refreshTokenEncrypted: null,
      refreshTokenNonce: null,
    };
  };

  it('loads a connection scoped to the organization (not the user)', async () => {
    prisma.connection.findFirst.mockResolvedValue(seed('org-A', 'custom', { apiKey: 'k' }));

    const conn = await loader.load('org-A', 'conn-1');

    expect(conn?.id).toBe('conn-1');
    expect(prisma.connection.findFirst).toHaveBeenCalledWith({
      where: { id: 'conn-1', organizationId: 'org-A' },
    });
  });

  it('returns null when the connection is not owned by the org', async () => {
    prisma.connection.findFirst.mockResolvedValue(null);

    const conn = await loader.load('org-A', 'conn-1');

    expect(conn).toBeNull();
  });
});
