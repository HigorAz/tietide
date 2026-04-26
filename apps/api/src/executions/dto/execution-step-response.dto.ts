import { ApiProperty } from '@nestjs/swagger';

export class ExecutionStepResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  executionId!: string;

  @ApiProperty()
  nodeId!: string;

  @ApiProperty()
  nodeType!: string;

  @ApiProperty()
  nodeName!: string;

  @ApiProperty({ enum: ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED'] })
  status!: string;

  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  inputData!: Record<string, unknown> | null;

  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  outputData!: Record<string, unknown> | null;

  @ApiProperty({ type: String, nullable: true })
  error!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  finishedAt!: Date | null;

  @ApiProperty({ type: Number, nullable: true })
  durationMs!: number | null;
}
