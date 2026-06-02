import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CryptoCore, type EncryptedPayload } from '@tietide/crypto';

export type { EncryptedPayload };

@Injectable()
export class CryptoService implements OnModuleInit {
  private core!: CryptoCore;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const rawKey = this.config.getOrThrow<string>('ENCRYPTION_MASTER_KEY');
    // Optional decrypt-only former keys for zero-downtime master-key rotation
    // (W3.17): a comma-separated list of previous base64 keys. New data is always
    // encrypted with ENCRYPTION_MASTER_KEY; data written under an old key still
    // decrypts via the ring until it is re-encrypted.
    const oldKeys = (this.config.get<string>('ENCRYPTION_MASTER_KEYS_OLD') ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    try {
      this.core =
        oldKeys.length > 0
          ? await CryptoCore.fromBase64Keyring(rawKey, oldKeys)
          : await CryptoCore.fromBase64Key(rawKey);
    } catch (err) {
      const message = (err as Error).message ?? 'invalid key';
      if (/base64/i.test(message)) {
        throw new Error('ENCRYPTION_MASTER_KEY must be valid base64');
      }
      throw new Error(`ENCRYPTION_MASTER_KEY must decode to 32 bytes (${message})`);
    }
  }

  encrypt(plaintext: string): EncryptedPayload {
    return this.core.encrypt(plaintext);
  }

  decrypt(ciphertext: string, nonce: string): string {
    try {
      return this.core.decrypt(ciphertext, nonce);
    } catch {
      throw new Error('Failed to decrypt secret');
    }
  }
}
