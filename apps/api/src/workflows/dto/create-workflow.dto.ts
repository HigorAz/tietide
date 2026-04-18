import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { WorkflowDefinitionDto } from './workflow-definition.dto';

export class CreateWorkflowDto {
  @ApiProperty({ example: 'My first workflow', minLength: 1, maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiProperty({ type: WorkflowDefinitionDto })
  @ValidateNested()
  @Type(() => WorkflowDefinitionDto)
  definition!: WorkflowDefinitionDto;
}
