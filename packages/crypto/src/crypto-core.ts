import sodium from 'libsodium-wrappers';

export interface EncryptedPayload {
  ciphertext: string;
  nonce: string;
}

export class CryptoCore {
  private readonly key: Uint8Array;

  constructor(key: Uint8Array) {
    const expected = sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES;
    if (key.length !== expected) {
      throw new Error(`Master key must be ${expected} bytes (got ${key.length})`);
    }
    this.key = key;
  }

  static async fromBase64Key(masterKeyBase64: string): Promise<CryptoCore> {
    await sodium.ready;

    let decoded: Uint8Array;
    try {
      decoded = sodium.from_base64(masterKeyBase64, sodium.base64_variants.ORIGINAL);
    } catch {
      throw new Error('Master key must be valid base64');
    }

    return new CryptoCore(decoded);
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
      throw new Error('Failed to decrypt: malformed base64 input');
    }

    const plainBytes = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      cipherBytes,
      null,
      nonceBytes,
      this.key,
    );
    return sodium.to_string(plainBytes);
  }
}
