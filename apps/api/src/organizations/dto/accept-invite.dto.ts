import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class AcceptInviteDto {
  @ApiProperty({ description: 'The raw single-use invite token from the emailed link.' })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  token!: string;
}
