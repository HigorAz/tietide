import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsObject, IsString, MaxLength, MinLength } from 'class-validator';
import { ConnectionProvider, ConnectionType } from '@tietide/shared';

export class CreateConnectionDto {
  @ApiProperty({
    enum: Object.values(ConnectionProvider),
    example: ConnectionProvider.OPENAI,
  })
  @IsEnum(ConnectionProvider)
  provider!: ConnectionProvider;

  @ApiProperty({
    enum: Object.values(ConnectionType),
    example: ConnectionType.API_KEY,
    description:
      'Any non-OAuth type (API_KEY, CUSTOM, BASIC_AUTH, BEARER_TOKEN). OAuth (OAUTH2) connections are created via /connections/oauth/start.',
  })
  @IsEnum(ConnectionType)
  type!: ConnectionType;

  @ApiProperty({ example: 'My OpenAI', minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    description:
      'Provider-specific config. Validated against PROVIDER_CONFIG_SCHEMAS[provider] (Zod).',
    example: { apiKey: 'sk-abc', organization: 'org-1' },
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  config!: Record<string, unknown>;
}
