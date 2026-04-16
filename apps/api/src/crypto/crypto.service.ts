import type { OnModuleInit } from '@nestjs/common';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sodium from 'libsodium-wrappers';

export interface EncryptedPayload {
  ciphertext: string;
  nonce: string;
}

@Injectable()
export class CryptoService implements OnModuleInit {
  private key!: Uint8Array;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await sodium.ready;

    const rawKey = this.config.getOrThrow<string>('ENCRYPTION_MASTER_KEY');

    let decoded: Uint8Array;
    try {
      decoded = sodium.from_base64(rawKey, sodium.base64_variants.ORIGINAL);
    } catch {
      throw new Error('ENCRYPTION_MASTER_KEY must be valid base64');
    }

    const expectedLength = sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES;
    if (decoded.length !== expectedLength) {
      throw new Error(
        `ENCRYPTION_MASTER_KEY must decode to ${expectedLength} bytes (got ${decoded.length})`,
      );
    }

    this.key = decoded;
  }

  encrypt(plaintext: string): EncryptedPayload {
    const nonceBytes = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    const cipherBytes = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      sodium.from_string(plaintext),
      null,
      null,
      nonceBytes,
      this.key,
    );
    return {
      ciphertext: sodium.to_base64(cipherBytes, sodium.base64_variants.ORIGINAL),
      nonce: sodium.to_base64(nonceBytes, sodium.base64_variants.ORIGINAL),
    };
  }

  decrypt(ciphertext: string, nonce: string): string {
    let cipherBytes: Uint8Array;
    let nonceBytes: Uint8Array;
    try {
      cipherBytes = sodium.from_base64(ciphertext, sodium.base64_variants.ORIGINAL);
      nonceBytes = sodium.from_base64(nonce, sodium.base64_variants.ORIGINAL);
    } catch {
      throw new InternalServerErrorException('Failed to decrypt secret');
    }

    try {
      const plainBytes = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        cipherBytes,
        null,
        nonceBytes,
        this.key,
      );
      return sodium.to_string(plainBytes);
    } catch {
      throw new InternalServerErrorException('Failed to decrypt secret');
    }
  }
}
