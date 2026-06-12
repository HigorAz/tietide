import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';
import {
  DEFAULT_TRIGGER_DATA_MAX_BYTES,
  MaxSerializedBytes,
} from '../../common/validators/max-serialized-bytes.validator';
import { IsSafeNodeConfig } from '../../common/validators/safe-node-config.validator';

export class TriggerExecutionDto {
  @ApiPropertyOptional({
    description: 'Optional payload exposed to trigger nodes as initial data.',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  @IsSafeNodeConfig()
  @MaxSerializedBytes(DEFAULT_TRIGGER_DATA_MAX_BYTES)
  triggerData?: Record<string, unknown>;
}
