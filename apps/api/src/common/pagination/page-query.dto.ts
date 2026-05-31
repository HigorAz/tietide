import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 100;

/**
 * Shared query params for keyset-paginated list endpoints. `limit` is clamped to
 * [1, MAX_PAGE_LIMIT]; `cursor` is the opaque token returned as a previous page's
 * `nextCursor`.
 */
export class PageQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_PAGE_LIMIT,
    default: DEFAULT_PAGE_LIMIT,
    description: 'Maximum items to return (clamped to the server maximum).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit?: number;

  @ApiPropertyOptional({ description: "Opaque cursor from a previous page's nextCursor." })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;
}

/** Clamp a requested limit into the allowed range, defaulting when absent/invalid. */
export function resolveLimit(limit?: number): number {
  if (!limit || !Number.isInteger(limit) || limit < 1) {
    return DEFAULT_PAGE_LIMIT;
  }
  return Math.min(limit, MAX_PAGE_LIMIT);
}
