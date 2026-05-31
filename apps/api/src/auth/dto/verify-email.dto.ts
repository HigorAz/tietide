import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({ description: 'The single-use verification token from the emailed link' })
  @IsString()
  @MinLength(10)
  @MaxLength(512)
  token!: string;
}
