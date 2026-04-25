import { ApiProperty } from '@nestjs/swagger';

export class WebhookTriggerResponseDto {
  @ApiProperty({ format: 'uuid' })
  executionId!: string;

  @ApiProperty({ enum: ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED'] })
  status!: string;
}
