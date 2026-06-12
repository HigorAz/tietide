import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH, PasswordPolicy } from './password-policy';

export class ChangePasswordDto {
  @ApiProperty({ minLength: 1, maxLength: 128, description: 'The account’s current password' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({ minLength: MIN_PASSWORD_LENGTH, maxLength: MAX_PASSWORD_BYTES })
  // Same strength policy as registration: letter+digit, no common password, within
  // bcrypt's 72-byte input.
  @PasswordPolicy()
  newPassword!: string;
}
