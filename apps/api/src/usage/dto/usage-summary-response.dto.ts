import { ApiProperty } from '@nestjs/swagger';

export class RunsPerDayPointDto {
  @ApiProperty({ description: 'UTC YYYY-MM-DD' })
  date!: string;

  @ApiProperty()
  count!: number;
}

export class TopWorkflowDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  runs!: number;

  @ApiProperty({ description: 'Fraction in [0, 1]' })
  successRate!: number;
}

export class UsageSummaryResponseDto {
  @ApiProperty()
  totalRuns!: number;

  @ApiProperty({ description: 'Fraction in [0, 1]; 0 when totalRuns === 0' })
  successRate!: number;

  @ApiProperty({ description: 'Average duration in ms across terminal executions; 0 when none' })
  avgDurationMs!: number;

  @ApiProperty()
  activeWorkflows!: number;

  @ApiProperty({ type: [RunsPerDayPointDto], description: 'Length === rangeDays, zero-filled' })
  runsPerDay!: RunsPerDayPointDto[];

  @ApiProperty({ type: [TopWorkflowDto], description: 'Up to 5 entries, ordered by runs desc' })
  topWorkflows!: TopWorkflowDto[];
}
