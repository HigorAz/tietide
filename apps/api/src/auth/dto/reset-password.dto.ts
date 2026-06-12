import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH, PasswordPolicy } from './password-policy';

export class ResetPasswordDto {
  @ApiProperty({ description: 'The single-use reset token from the emailed link' })
  @IsString()
  @MinLength(10)
  @MaxLength(512)
  token!: string;

  @ApiProperty({ minLength: MIN_PASSWORD_LENGTH, maxLength: MAX_PASSWORD_BYTES })
  // Same strength policy as registration: letter+digit, no common password, within
  // bcrypt's 72-byte input.
  @PasswordPolicy()
  password!: string;
}
