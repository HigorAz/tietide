import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import sodium from 'libsodium-wrappers';
import { CryptoService } from './crypto.service';

describe('CryptoService (worker)', () => {
  let masterKeyBase64: string;

  beforeAll(async () => {
    await sodium.ready;
    const keyBytes = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES);
    masterKeyBase64 = sodium.to_base64(keyBytes, sodium.base64_variants.ORIGINAL);
  });

  const buildService = async (config: Record<string, string>): Promise<CryptoService> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CryptoService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: <T>(key: string): T => {
              if (!(key in config)) {
                throw new Error(`Missing config: ${key}`);
              }
              return config[key] as unknown as T;
            },
          },
        },
      ],
    }).compile();

    const service = module.get<CryptoService>(CryptoService);
    await service.onModuleInit();
    return service;
  };

  describe('onModuleInit', () => {
    it('should load a valid 32-byte base64 master key without throwing', async () => {
      await expect(
        buildService({ ENCRYPTION_MASTER_KEY: masterKeyBase64 }),
      ).resolves.toBeInstanceOf(CryptoService);
    });

    it('should throw when ENCRYPTION_MASTER_KEY is missing', async () => {
      await expect(buildService({})).rejects.toThrow(/ENCRYPTION_MASTER_KEY/);
    });

    it('should throw when ENCRYPTION_MASTER_KEY is not valid base64', async () => {
      await expect(buildService({ ENCRYPTION_MASTER_KEY: 'not!valid!base64!!!' })).rejects.toThrow(
        /base64/i,
      );
    });

    it('should throw when the decoded key length is not 32 bytes', async () => {
      const shortKey = sodium.to_base64(
        sodium.randombytes_buf(16),
        sodium.base64_variants.ORIGINAL,
      );
      await expect(buildService({ ENCRYPTION_MASTER_KEY: shortKey })).rejects.toThrow(/32/);
    });
  });

  describe('decrypt', () => {
    it('should round-trip ciphertext produced by the same service', async () => {
      const service = await buildService({ ENCRYPTION_MASTER_KEY: masterKeyBase64 });
      const plaintext = 'sk_test_abc123';

      const { ciphertext, nonce } = service.encrypt(plaintext);

      expect(service.decrypt(ciphertext, nonce)).toBe(plaintext);
    });

    it('should round-trip ciphertext produced by another service with the same key (api compat)', async () => {
      const apiSide = await buildService({ ENCRYPTION_MASTER_KEY: masterKeyBase64 });
      const workerSide = await buildService({ ENCRYPTION_MASTER_KEY: masterKeyBase64 });
      const plaintext = 'cross-service-secret';

      const { ciphertext, nonce } = apiSide.encrypt(plaintext);

      expect(workerSide.decrypt(ciphertext, nonce)).toBe(plaintext);
    });

    it('should throw a generic error when ciphertext is tampered', async () => {
      const service = await buildService({ ENCRYPTION_MASTER_KEY: masterKeyBase64 });
      const { ciphertext, nonce } = service.encrypt('hello');
      const cipherBytes = sodium.from_base64(ciphertext, sodium.base64_variants.ORIGINAL);
      cipherBytes[0] = cipherBytes[0]! ^ 0x01;
      const tampered = sodium.to_base64(cipherBytes, sodium.base64_variants.ORIGINAL);

      expect(() => service.decrypt(tampered, nonce)).toThrow(/decrypt/i);
    });
  });
});
