import { ApiProperty } from '@nestjs/swagger';

export class RunsPerDayPointDto {
  @ApiProperty({ description: 'UTC YYYY-MM-DD' })
  date!: string;

  @ApiProperty({ description: 'Total executions that day' })
  count!: number;

  @ApiProperty({ description: 'FAILED executions that day (subset of count)' })
  failed!: number;
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

export class StatusCountDto {
  @ApiProperty({
    description: 'ExecutionStatus value (PENDING/RUNNING/SUCCESS/FAILED/CANCELLED/SKIPPED)',
  })
  status!: string;

  @ApiProperty()
  count!: number;
}

export class TriggerCountDto {
  @ApiProperty({ description: 'Trigger type, e.g. manual, cron, webhook, provider:stripe' })
  triggerType!: string;

  @ApiProperty()
  count!: number;
}

export class BusiestHourDto {
  @ApiProperty({ description: 'Hour of day in UTC, 0-23' })
  hour!: number;

  @ApiProperty()
  count!: number;
}

export class RecentFailureDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  workflowId!: string;

  @ApiProperty()
  workflowName!: string;

  @ApiProperty({ nullable: true, description: 'Error message, may be null' })
  error!: string | null;

  @ApiProperty({ nullable: true, description: 'ISO timestamp, may be null' })
  finishedAt!: string | null;

  @ApiProperty({ description: 'ISO timestamp' })
  createdAt!: string;
}

export class ConnectionHealthDto {
  @ApiProperty({ description: 'ConnectionStatus value (ACTIVE/EXPIRED/ERROR/REVOKED)' })
  status!: string;

  @ApiProperty()
  count!: number;
}

export class NodeFailureDto {
  @ApiProperty({ description: 'Node type string, e.g. http-request' })
  nodeType!: string;

  @ApiProperty({ description: 'Number of FAILED steps of this type in the window' })
  failures!: number;

  @ApiProperty({ description: 'Average step duration in ms across failed steps; 0 when unknown' })
  avgDurationMs!: number;
}

export class PeriodComparisonDto {
  @ApiProperty({
    nullable: true,
    description: 'Relative change (curr-prev)/prev; null when the prior window had zero runs',
  })
  totalRunsDelta!: number | null;

  @ApiProperty({
    description: 'Absolute point change in success rate (curr-prev), both in [0,1]',
  })
  successRateDelta!: number;

  @ApiProperty({
    nullable: true,
    description:
      'Relative change (curr-prev)/prev; null when the prior window had zero avg duration',
  })
  avgDurationDelta!: number | null;
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

  @ApiProperty({
    type: [StatusCountDto],
    description: 'All execution statuses, zero-filled, in a stable order',
  })
  statusBreakdown!: StatusCountDto[];

  @ApiProperty({
    type: [TriggerCountDto],
    description: 'Runs grouped by triggerType, ordered by count desc',
  })
  triggerDistribution!: TriggerCountDto[];

  @ApiProperty({
    type: [BusiestHourDto],
    description: '24 entries (hour 0-23 UTC), zero-filled',
  })
  busiestHours!: BusiestHourDto[];

  @ApiProperty({
    type: [RecentFailureDto],
    description: 'Latest FAILED executions, newest first, capped',
  })
  recentFailures!: RecentFailureDto[];

  @ApiProperty({
    type: [ConnectionHealthDto],
    description: 'Connection counts grouped by status for the org',
  })
  connectionHealth!: ConnectionHealthDto[];

  @ApiProperty({
    type: [NodeFailureDto],
    description: 'Top failing node types with avg step duration',
  })
  nodeFailures!: NodeFailureDto[];

  @ApiProperty({ type: PeriodComparisonDto, description: 'Deltas vs the prior equivalent window' })
  comparison!: PeriodComparisonDto;
}
