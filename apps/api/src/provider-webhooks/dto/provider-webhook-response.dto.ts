import { ApiProperty } from '@nestjs/swagger';

export class ProviderWebhookResponseDto {
  @ApiProperty({ format: 'uuid' })
  executionId!: string;

  @ApiProperty({ enum: ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED'] })
  status!: string;
}
