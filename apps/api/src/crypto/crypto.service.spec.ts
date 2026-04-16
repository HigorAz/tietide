import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import sodium from 'libsodium-wrappers';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
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

  describe('encrypt', () => {
    it('should return ciphertext and nonce as base64 strings', async () => {
      const service = await buildService({ ENCRYPTION_MASTER_KEY: masterKeyBase64 });

      const result = service.encrypt('hello world');

      expect(typeof result.ciphertext).toBe('string');
      expect(typeof result.nonce).toBe('string');
      expect(result.ciphertext.length).toBeGreaterThan(0);
      expect(result.nonce.length).toBeGreaterThan(0);
    });

    it('should produce a 24-byte nonce (decoded length)', async () => {
      const service = await buildService({ ENCRYPTION_MASTER_KEY: masterKeyBase64 });

      const { nonce } = service.encrypt('any');
      const decoded = sodium.from_base64(nonce, sodium.base64_variants.ORIGINAL);

      expect(decoded.length).toBe(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
      expect(decoded.length).toBe(24);
    });

    it('should produce a different nonce and ciphertext on each call for the same input', async () => {
      const service = await buildService({ ENCRYPTION_MASTER_KEY: masterKeyBase64 });

      const first = service.encrypt('secret-value');
      const second = service.encrypt('secret-value');

      expect(first.nonce).not.toBe(second.nonce);
      expect(first.ciphertext).not.toBe(second.ciphertext);
    });
  });

  describe('decrypt', () => {
    it('should round-trip ASCII plaintext back to the original string', async () => {
      const service = await buildService({ ENCRYPTION_MASTER_KEY: masterKeyBase64 });
      const plaintext = 'github_pat_abc_123';

      const { ciphertext, nonce } = service.encrypt(plaintext);

      expect(service.decrypt(ciphertext, nonce)).toBe(plaintext);
    });

    it('should round-trip UTF-8 multibyte plaintext (emoji + non-ASCII)', async () => {
      const service = await buildService({ ENCRYPTION_MASTER_KEY: masterKeyBase64 });
      const plaintext = 'sênha-çom-émojí-🔐-and-中文';

      const { ciphertext, nonce } = service.encrypt(plaintext);

      expect(service.decrypt(ciphertext, nonce)).toBe(plaintext);
    });

    it('should throw when the ciphertext has been tampered with', async () => {
      const service = await buildService({ ENCRYPTION_MASTER_KEY: masterKeyBase64 });
      const { ciphertext, nonce } = service.encrypt('hello');

      const cipherBytes = sodium.from_base64(ciphertext, sodium.base64_variants.ORIGINAL);
      cipherBytes[0] = cipherBytes[0] ^ 0x01;
      const tamperedCiphertext = sodium.to_base64(cipherBytes, sodium.base64_variants.ORIGINAL);

      expect(() => service.decrypt(tamperedCiphertext, nonce)).toThrow();
    });

    it('should throw when the nonce does not match the ciphertext', async () => {
      const service = await buildService({ ENCRYPTION_MASTER_KEY: masterKeyBase64 });
      const first = service.encrypt('hello');
      const second = service.encrypt('world');

      expect(() => service.decrypt(first.ciphertext, second.nonce)).toThrow();
    });
  });
});
