import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ListAuditLogQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by acting user id' })
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @ApiPropertyOptional({ description: 'Filter by audit action (e.g. env-var.create)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  action?: string;

  @ApiPropertyOptional({ description: 'Filter by resource type (e.g. env-var, workflow)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  resource?: string;

  @ApiPropertyOptional({ description: 'Inclusive lower bound (ISO-8601) for createdAt' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'Exclusive upper bound (ISO-8601) for createdAt' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ description: 'Opaque pagination cursor (base64url)' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'cursor must be base64url' })
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
