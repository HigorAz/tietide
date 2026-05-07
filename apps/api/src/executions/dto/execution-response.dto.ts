import { ApiProperty } from '@nestjs/swagger';

export class ExecutionResponseDto {
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

  @ApiProperty({
    type: Boolean,
    description: 'True when this execution was created via POST /workflows/:id/test.',
  })
  isDryRun!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
