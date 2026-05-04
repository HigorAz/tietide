import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export enum UsageRange {
  D7 = '7d',
  D30 = '30d',
  D90 = '90d',
}

export class UsageSummaryQueryDto {
  @ApiPropertyOptional({
    enum: UsageRange,
    default: UsageRange.D7,
    description: 'Time window for the summary (rolling, ending at "now").',
  })
  @IsOptional()
  @IsEnum(UsageRange)
  range?: UsageRange = UsageRange.D7;
}
