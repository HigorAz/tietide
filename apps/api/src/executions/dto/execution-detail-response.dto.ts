import { ApiProperty } from '@nestjs/swagger';

export class ExecutionDetailResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  workflowId!: string;

  @ApiProperty({ enum: ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED'] })
  status!: string;

  @ApiProperty({ example: 'manual' })
  triggerType!: string;

  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  triggerData!: Record<string, unknown> | null;

  @ApiProperty({ type: String, nullable: true })
  idempotencyKey!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  finishedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  error!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class ExecutionListResponseDto {
  @ApiProperty({ type: [ExecutionDetailResponseDto] })
  items!: ExecutionDetailResponseDto[];

  @ApiProperty({ type: Number })
  total!: number;

  @ApiProperty({ type: Number })
  page!: number;

  @ApiProperty({ type: Number })
  pageSize!: number;
}
