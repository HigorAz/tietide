import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';

export class TriggerExecutionDto {
  @ApiPropertyOptional({
    description: 'Optional payload exposed to trigger nodes as initial data.',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  triggerData?: Record<string, unknown>;
}
