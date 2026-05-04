import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ExecutionStatusFilter } from './execution-query.dto';

export class AllExecutionsQueryDto {
  @ApiPropertyOptional({ enum: ExecutionStatusFilter })
  @IsOptional()
  @IsEnum(ExecutionStatusFilter)
  status?: ExecutionStatusFilter;

  @ApiPropertyOptional({ type: String, format: 'uuid', description: 'Filter to a single workflow' })
  @IsOptional()
  @IsUUID('4')
  workflowId?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Filter createdAt >= from',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Filter createdAt <= to' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: 100,
    description: 'Alias for pageSize. If both are provided, pageSize wins.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
