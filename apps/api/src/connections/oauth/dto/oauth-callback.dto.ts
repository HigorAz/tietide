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

  // Provider-supplied extras we don't use but must accept to avoid 400 under
  // the global `forbidNonWhitelisted` policy. Google attaches `iss`/`scope`/
  // `authuser`/`prompt`/`hd`; Microsoft adds `session_state`/`scope`.
  @IsOptional() @IsString() @MaxLength(512) iss?: string;
  @IsOptional() @IsString() @MaxLength(2048) scope?: string;
  @IsOptional() @IsString() @MaxLength(32) authuser?: string;
  @IsOptional() @IsString() @MaxLength(64) prompt?: string;
  @IsOptional() @IsString() @MaxLength(256) hd?: string;
  @IsOptional() @IsString() @MaxLength(256) session_state?: string;
}
