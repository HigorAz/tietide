import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RegisterDto } from './register.dto';
import { ResetPasswordDto } from './reset-password.dto';
import { ChangePasswordDto } from './change-password.dto';
import { MAX_PASSWORD_BYTES } from './password-policy';

// W5.50: strengthen the password policy that guards register / reset-password /
// change-password.
//   - Reject a curated denylist of common passwords (e.g. "password1") even when
//     they satisfy the letter+digit rule, closing the easiest credential-stuffing
//     guesses.
//   - Cap the password at bcrypt's effective 72-byte input. bcrypt silently
//     truncates anything past 72 bytes, so a 128-char limit lets two distinct
//     long passwords hash identically; rejecting >72 bytes removes that footgun.

describe('password policy', () => {
  describe('RegisterDto.password', () => {
    const base = { email: 'user@example.com', name: 'User' };

    it('rejects a common password from the denylist (password1)', async () => {
      const dto = plainToInstance(RegisterDto, { ...base, password: 'password1' });
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'password')).toBeDefined();
    });

    it('rejects a password longer than bcrypt’s 72-byte input limit', async () => {
      // 73 ASCII chars = 73 bytes > 72; also satisfies letter+digit so only the
      // byte-length rule can reject it.
      const password = 'a'.repeat(72) + '1';
      expect(Buffer.byteLength(password, 'utf8')).toBe(MAX_PASSWORD_BYTES + 1);
      const dto = plainToInstance(RegisterDto, { ...base, password });
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'password')).toBeDefined();
    });

    it('accepts a strong, non-common password within the byte limit', async () => {
      const dto = plainToInstance(RegisterDto, { ...base, password: 'Str0ngP@ssphrase' });
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'password')).toBeUndefined();
    });
  });

  describe('ResetPasswordDto.password', () => {
    const base = { token: 'a-valid-reset-token-1234567890' };

    it('rejects a common password from the denylist', async () => {
      const dto = plainToInstance(ResetPasswordDto, { ...base, password: 'password1' });
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'password')).toBeDefined();
    });

    it('rejects a password past the 72-byte limit', async () => {
      const dto = plainToInstance(ResetPasswordDto, { ...base, password: 'a'.repeat(72) + '1' });
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'password')).toBeDefined();
    });

    it('accepts a strong, non-common password', async () => {
      const dto = plainToInstance(ResetPasswordDto, { ...base, password: 'Str0ngP@ssphrase' });
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'password')).toBeUndefined();
    });
  });

  describe('ChangePasswordDto.newPassword', () => {
    const base = { currentPassword: 'whatever123' };

    it('rejects a common new password from the denylist', async () => {
      const dto = plainToInstance(ChangePasswordDto, { ...base, newPassword: 'password1' });
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'newPassword')).toBeDefined();
    });

    it('rejects a new password past the 72-byte limit', async () => {
      const dto = plainToInstance(ChangePasswordDto, {
        ...base,
        newPassword: 'a'.repeat(72) + '1',
      });
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'newPassword')).toBeDefined();
    });

    it('accepts a strong, non-common new password', async () => {
      const dto = plainToInstance(ChangePasswordDto, { ...base, newPassword: 'Str0ngP@ssphrase' });
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'newPassword')).toBeUndefined();
    });
  });
});
