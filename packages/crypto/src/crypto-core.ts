import sodium from 'libsodium-wrappers';

export interface EncryptedPayload {
  ciphertext: string;
  nonce: string;
}

export class CryptoCore {
  // Keyring for master-key rotation (W3.17): the first key is the PRIMARY, used for
  // every new `encrypt`; the remainder are kept decrypt-only so data written under a
  // former key still opens after rotation. Because XChaCha20-Poly1305 is
  // authenticated, `decrypt` can simply try each key and accept the one whose tag
  // verifies — so rotation needs NO ciphertext-format change and NO migration: deploy
  // a new primary, keep the old key in the ring, and (optionally, at leisure)
  // re-encrypt rows in the background before finally dropping the old key.
  private readonly keys: Uint8Array[];

  constructor(keys: Uint8Array | Uint8Array[]) {
    const list = Array.isArray(keys) ? keys : [keys];
    if (list.length === 0) {
      throw new Error('CryptoCore requires at least one key');
    }
    const expected = sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES;
    for (const k of list) {
      if (k.length !== expected) {
        throw new Error(`Master key must be ${expected} bytes (got ${k.length})`);
      }
    }
    this.keys = list;
  }

  static async fromBase64Key(masterKeyBase64: string): Promise<CryptoCore> {
    await sodium.ready;
    return new CryptoCore(decodeBase64Key(masterKeyBase64));
  }

  // Construct a rotation keyring: `primaryKeyBase64` encrypts new data; every key in
  // `additionalKeysBase64` (older keys) remains available for decryption only.
  static async fromBase64Keyring(
    primaryKeyBase64: string,
    additionalKeysBase64: string[] = [],
  ): Promise<CryptoCore> {
    await sodium.ready;
    const keys = [primaryKeyBase64, ...additionalKeysBase64].map(decodeBase64Key);
    return new CryptoCore(keys);
  }

  encrypt(plaintext: string): EncryptedPayload {
    const nonceBytes = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    const cipherBytes = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      sodium.from_string(plaintext),
      null,
      null,
      nonceBytes,
      this.keys[0]!,
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

    // Try each key (primary first): the AEAD tag verifies under exactly the key the
    // data was written with, so a wrong key throws and we fall through to the next.
    for (const key of this.keys) {
      try {
        const plainBytes = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
          null,
          cipherBytes,
          null,
          nonceBytes,
          key,
        );
        return sodium.to_string(plainBytes);
      } catch {
        // Wrong key for this ciphertext — try the next one in the ring.
      }
    }
    throw new Error('Failed to decrypt: no key in the keyring could authenticate the ciphertext');
  }
}

function decodeBase64Key(keyBase64: string): Uint8Array {
  try {
    return sodium.from_base64(keyBase64, sodium.base64_variants.ORIGINAL);
  } catch {
    throw new Error('Master key must be valid base64');
  }
}
