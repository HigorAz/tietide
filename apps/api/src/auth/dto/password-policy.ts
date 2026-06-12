import { applyDecorators } from '@nestjs/common';
import {
  IsString,
  Matches,
  MaxLength,
  MinLength,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';

// bcrypt only hashes the first 72 bytes of its input and silently discards the
// rest. Allowing longer passwords is a footgun: two distinct long passwords that
// share a 72-byte prefix hash to the same value, so the suffix carries no entropy
// and a "stronger" 128-char password is no harder to guess than its prefix. Cap
// the accepted password at bcrypt's effective input so what the user types is what
// actually protects the account.
export const MAX_PASSWORD_BYTES = 72;
export const MIN_PASSWORD_LENGTH = 8;

// At least one letter and one digit — rejects all-numeric / all-alphabetic.
const STRENGTH_REGEX = /^(?=.*[A-Za-z])(?=.*\d).+$/;

// A small curated denylist of the most-guessed passwords that nonetheless satisfy
// the letter+digit rule. This is the cheap first line against credential stuffing;
// a full HIBP k-anonymity breach lookup is deferred (needs an external call). All
// entries are stored lowercase and matched case-insensitively.
const COMMON_PASSWORDS = new Set<string>([
  'password1',
  'password123',
  'passw0rd',
  'p@ssw0rd',
  'password12',
  'iloveyou1',
  'qwerty123',
  'qwerty1234',
  'abc12345',
  'abcd1234',
  'admin123',
  'letmein1',
  'welcome1',
  'welcome123',
  'monkey123',
  'dragon123',
  'football1',
  'baseball1',
  'sunshine1',
  'princess1',
  'trustno1',
  'master123',
  'login123',
  'changeme1',
  'secret123',
]);

/**
 * Validator: the password must not be a known common password and must fit within
 * bcrypt's 72-byte input. Applied alongside the length + strength decorators below.
 */
function IsAllowedPassword(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol): void {
    registerDecorator({
      name: 'isAllowedPassword',
      target: object.constructor,
      propertyName: propertyName.toString(),
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') {
            return false;
          }
          if (Buffer.byteLength(value, 'utf8') > MAX_PASSWORD_BYTES) {
            return false;
          }
          if (COMMON_PASSWORDS.has(value.toLowerCase())) {
            return false;
          }
          return true;
        },
        defaultMessage(): string {
          return 'password is too common or exceeds the 72-byte limit';
        },
      },
    });
  };
}

/**
 * Composite password-field policy reused by register / reset-password /
 * change-password. Enforces: string, 8..72-byte length, letter+digit strength, and
 * the common-password denylist + bcrypt 72-byte cap (W5.50).
 */
export function PasswordPolicy(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    MinLength(MIN_PASSWORD_LENGTH),
    MaxLength(MAX_PASSWORD_BYTES),
    Matches(STRENGTH_REGEX, {
      message: 'password must contain at least one letter and one number',
    }),
    IsAllowedPassword(),
  );
}
