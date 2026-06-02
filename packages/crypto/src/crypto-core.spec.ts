import sodium from 'libsodium-wrappers';
import { CryptoCore } from './crypto-core';

describe('CryptoCore', () => {
  let key: Uint8Array;

  beforeAll(async () => {
    await sodium.ready;
    key = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES);
  });

  describe('fromBase64Key', () => {
    it('should construct from a valid base64-encoded 32-byte key', async () => {
      const base64 = sodium.to_base64(key, sodium.base64_variants.ORIGINAL);

      const core = await CryptoCore.fromBase64Key(base64);

      expect(core).toBeInstanceOf(CryptoCore);
    });

    it('should throw when the key is not valid base64', async () => {
      await expect(CryptoCore.fromBase64Key('not!valid!base64!!!')).rejects.toThrow(/base64/i);
    });

    it('should throw when the decoded key length is not 32 bytes', async () => {
      const shortBytes = sodium.randombytes_buf(16);
      const base64 = sodium.to_base64(shortBytes, sodium.base64_variants.ORIGINAL);

      await expect(CryptoCore.fromBase64Key(base64)).rejects.toThrow(/32/);
    });
  });

  describe('encrypt', () => {
    it('should produce base64 ciphertext and a 24-byte nonce', async () => {
      const core = new CryptoCore(key);

      const result = core.encrypt('hello');

      expect(typeof result.ciphertext).toBe('string');
      expect(typeof result.nonce).toBe('string');
      const nonceBytes = sodium.from_base64(result.nonce, sodium.base64_variants.ORIGINAL);
      expect(nonceBytes.length).toBe(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
      expect(nonceBytes.length).toBe(24);
    });

    it('should produce different nonce and ciphertext on each call for the same plaintext', () => {
      const core = new CryptoCore(key);

      const a = core.encrypt('same');
      const b = core.encrypt('same');

      expect(a.nonce).not.toBe(b.nonce);
      expect(a.ciphertext).not.toBe(b.ciphertext);
    });
  });

  describe('decrypt', () => {
    it('should round-trip ASCII plaintext', () => {
      const core = new CryptoCore(key);
      const plaintext = 'github_pat_abc_123';

      const { ciphertext, nonce } = core.encrypt(plaintext);

      expect(core.decrypt(ciphertext, nonce)).toBe(plaintext);
    });

    it('should round-trip UTF-8 multibyte plaintext', () => {
      const core = new CryptoCore(key);
      const plaintext = 'sênha-çom-émojí-🔐-and-中文';

      const { ciphertext, nonce } = core.encrypt(plaintext);

      expect(core.decrypt(ciphertext, nonce)).toBe(plaintext);
    });

    it('should throw when ciphertext is tampered', () => {
      const core = new CryptoCore(key);
      const { ciphertext, nonce } = core.encrypt('hello');
      const cipherBytes = sodium.from_base64(ciphertext, sodium.base64_variants.ORIGINAL);
      cipherBytes[0] = cipherBytes[0]! ^ 0x01;
      const tampered = sodium.to_base64(cipherBytes, sodium.base64_variants.ORIGINAL);

      expect(() => core.decrypt(tampered, nonce)).toThrow();
    });

    it('should throw when the nonce does not match the ciphertext', () => {
      const core = new CryptoCore(key);
      const a = core.encrypt('hello');
      const b = core.encrypt('world');

      expect(() => core.decrypt(a.ciphertext, b.nonce)).toThrow();
    });

    it('should throw when ciphertext is malformed base64', () => {
      const core = new CryptoCore(key);
      const { nonce } = core.encrypt('hello');

      expect(() => core.decrypt('not!valid!base64!!!', nonce)).toThrow();
    });

    it('should throw when decrypted with a different key', () => {
      const coreA = new CryptoCore(key);
      const otherKey = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES);
      const coreB = new CryptoCore(otherKey);

      const { ciphertext, nonce } = coreA.encrypt('secret');

      expect(() => coreB.decrypt(ciphertext, nonce)).toThrow();
    });
  });

  describe('keyring (master-key rotation, W3.17)', () => {
    let newKey: Uint8Array;
    let oldKey: Uint8Array;

    beforeAll(() => {
      newKey = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES);
      oldKey = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES);
    });

    it('should still decrypt data written under a former primary key after rotation', () => {
      // Pre-rotation: a secret was encrypted with the old key.
      const { ciphertext, nonce } = new CryptoCore(oldKey).encrypt('legacy-secret');

      // Post-rotation: new key is primary, old key kept for decrypt-only.
      const rotated = new CryptoCore([newKey, oldKey]);
      expect(rotated.decrypt(ciphertext, nonce)).toBe('legacy-secret');
    });

    it('should encrypt new data with the primary (first) key only', () => {
      const rotated = new CryptoCore([newKey, oldKey]);
      const { ciphertext, nonce } = rotated.encrypt('fresh');

      // Decryptable with the new key, NOT with the old one — proves the primary
      // key was used for the write.
      expect(new CryptoCore(newKey).decrypt(ciphertext, nonce)).toBe('fresh');
      expect(() => new CryptoCore(oldKey).decrypt(ciphertext, nonce)).toThrow();
    });

    it('should throw when no key in the ring can authenticate the ciphertext', () => {
      const { ciphertext, nonce } = new CryptoCore(oldKey).encrypt('secret');
      const ringWithoutOldKey = new CryptoCore([newKey]);

      expect(() => ringWithoutOldKey.decrypt(ciphertext, nonce)).toThrow();
    });

    it('should reject an empty keyring', () => {
      expect(() => new CryptoCore([])).toThrow(/at least one key/i);
    });

    it('fromBase64Keyring should round-trip and decrypt a former-key ciphertext', async () => {
      const newB64 = sodium.to_base64(newKey, sodium.base64_variants.ORIGINAL);
      const oldB64 = sodium.to_base64(oldKey, sodium.base64_variants.ORIGINAL);

      const { ciphertext, nonce } = new CryptoCore(oldKey).encrypt('via-base64');
      const ring = await CryptoCore.fromBase64Keyring(newB64, [oldB64]);

      expect(ring.decrypt(ciphertext, nonce)).toBe('via-base64');
      const fresh = ring.encrypt('written-now');
      expect(ring.decrypt(fresh.ciphertext, fresh.nonce)).toBe('written-now');
    });

    it('fromBase64Keyring should reject a malformed additional key', async () => {
      const newB64 = sodium.to_base64(newKey, sodium.base64_variants.ORIGINAL);
      await expect(CryptoCore.fromBase64Keyring(newB64, ['not!valid!base64!!!'])).rejects.toThrow(
        /base64/i,
      );
    });
  });
});
