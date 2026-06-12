import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsObject, IsOptional, ValidateNested } from 'class-validator';
import { WorkflowDefinitionDto } from '../../workflows/dto/workflow-definition.dto';
import {
  DEFAULT_TRIGGER_DATA_MAX_BYTES,
  MaxSerializedBytes,
} from '../../common/validators/max-serialized-bytes.validator';
import { IsSafeNodeConfig } from '../../common/validators/safe-node-config.validator';

export class TestExecutionDto {
  @ApiProperty({
    type: WorkflowDefinitionDto,
    description:
      'In-memory workflow definition to run. Overrides the saved definition for this execution only.',
  })
  @IsObject()
  @ValidateNested()
  @Type(() => WorkflowDefinitionDto)
  definition!: WorkflowDefinitionDto;

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
