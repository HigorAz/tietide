import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';
import {
  DEFAULT_TRIGGER_DATA_MAX_BYTES,
  MaxSerializedBytes,
} from '../../common/validators/max-serialized-bytes.validator';

export class TriggerExecutionDto {
  @ApiPropertyOptional({
    description: 'Optional payload exposed to trigger nodes as initial data.',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  @MaxSerializedBytes(DEFAULT_TRIGGER_DATA_MAX_BYTES)
  triggerData?: Record<string, unknown>;
}
