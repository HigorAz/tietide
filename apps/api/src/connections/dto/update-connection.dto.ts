import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ConnectionStatus } from '@tietide/shared';

export class UpdateConnectionDto {
  @ApiPropertyOptional({
    example: 'My Slack workspace',
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    enum: Object.values(ConnectionStatus),
    example: ConnectionStatus.REVOKED,
  })
  @IsOptional()
  @IsEnum(ConnectionStatus)
  status?: ConnectionStatus;

  @ApiPropertyOptional({
    description:
      'New provider-specific credentials, validated against the provider schema and re-encrypted. ' +
      'Rejected for OAuth2 connections (reconnect to refresh those).',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
