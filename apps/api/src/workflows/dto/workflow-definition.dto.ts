import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsSafeNodeConfig } from '../../common/validators/safe-node-config.validator';

export class WorkflowNodePositionDto {
  @ApiProperty()
  @IsNumber()
  x!: number;

  @ApiProperty()
  @IsNumber()
  y!: number;
}

export class WorkflowNodeDto {
  @ApiProperty({ minLength: 1, example: 'n1' })
  @IsString()
  @MinLength(1)
  id!: string;

  @ApiProperty({ minLength: 1, example: 'manual-trigger' })
  @IsString()
  @MinLength(1)
  type!: string;

  @ApiProperty({ minLength: 1, maxLength: 255, example: 'Start' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ type: WorkflowNodePositionDto })
  @ValidateNested()
  @Type(() => WorkflowNodePositionDto)
  position!: WorkflowNodePositionDto;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  @IsSafeNodeConfig()
  config!: Record<string, unknown>;
}

export class WorkflowEdgeDto {
  @ApiProperty({ minLength: 1, example: 'e1' })
  @IsString()
  @MinLength(1)
  id!: string;

  @ApiProperty({ minLength: 1, example: 'n1' })
  @IsString()
  @MinLength(1)
  source!: string;

  @ApiProperty({ minLength: 1, example: 'n2' })
  @IsString()
  @MinLength(1)
  target!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceHandle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetHandle?: string;
}

export class WorkflowDefinitionDto {
  // Empty `nodes` is valid: new workflows are saved as drafts so the user can
  // pick a trigger from the sidebar before being committed to one. Topology
  // (trigger count, no cycles, no dangling edges) is enforced at execute time.
  @ApiProperty({ type: [WorkflowNodeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowNodeDto)
  nodes!: WorkflowNodeDto[];

  @ApiProperty({ type: [WorkflowEdgeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowEdgeDto)
  edges!: WorkflowEdgeDto[];
}
