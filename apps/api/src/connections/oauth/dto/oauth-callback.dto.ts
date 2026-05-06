import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { SUPPORTED_OAUTH_PROVIDERS } from './start-oauth.dto';

export class OAuthCallbackDto {
  @ApiProperty({ enum: SUPPORTED_OAUTH_PROVIDERS })
  @IsString()
  @IsIn(SUPPORTED_OAUTH_PROVIDERS as readonly string[])
  provider!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  code?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(4096)
  state!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(256)
  error?: string;
}
