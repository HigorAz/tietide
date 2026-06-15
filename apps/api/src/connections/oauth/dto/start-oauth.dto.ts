import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const SUPPORTED_OAUTH_PROVIDERS = [
  'google',
  'microsoft',
  'slack',
  'notion',
  'hubspot',
  'github',
  'instagram',
  'whatsapp',
] as const;
export type SupportedOAuthProvider = (typeof SUPPORTED_OAUTH_PROVIDERS)[number];

export class StartOAuthDto {
  @ApiProperty({ enum: SUPPORTED_OAUTH_PROVIDERS, example: 'google' })
  @IsString()
  @IsIn(SUPPORTED_OAUTH_PROVIDERS as readonly string[])
  provider!: string;

  @ApiPropertyOptional({
    description: 'Comma-separated scopes. Falls back to provider defaults when omitted.',
    example: 'openid,email',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Matches(/^[A-Za-z0-9_:./\-,\s]+$/, {
    message: 'scopes must be a comma-separated list of OAuth scope tokens',
  })
  scopes?: string;

  @ApiProperty({
    description: 'Display name for the new Connection',
    example: 'My Gmail',
    minLength: 1,
    maxLength: 120,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;
}
