import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeleteAccountDto {
  @ApiProperty({
    minLength: 1,
    maxLength: 128,
    description: 'Current password — re-authenticates this destructive action',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
