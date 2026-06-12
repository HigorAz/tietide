import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH, PasswordPolicy } from './password-policy';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com', maxLength: 255 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ minLength: MIN_PASSWORD_LENGTH, maxLength: MAX_PASSWORD_BYTES })
  // Strength policy: at least one letter and one digit, no known common password,
  // and within bcrypt's 72-byte input. (HIBP breach check deferred — needs an
  // external k-anonymity lookup.)
  @PasswordPolicy()
  password!: string;

  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}
