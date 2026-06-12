import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MAX_WORKFLOW_NODES, MAX_WORKFLOW_EDGES } from '@tietide/shared';
import { IsSafeNodeConfig } from '../../common/validators/safe-node-config.validator';

// Re-export the shared graph-size caps so the HTTP boundary and the Zod save
// boundary stay in lockstep (a single source of truth in @tietide/shared).
export { MAX_WORKFLOW_NODES, MAX_WORKFLOW_EDGES };

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

  // Stable, human-readable reference alias (`gmail_search`) used by data-pill
  // tokens. The SPA backfills + emits it for every node, so the DTO must accept
  // it (mirrors the shared `workflowNodeSchema.alias`). Optional/additive.
  @ApiPropertyOptional({ minLength: 1, maxLength: 255, example: 'code_1' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  alias?: string;

  @ApiProperty({ type: WorkflowNodePositionDto })
  @ValidateNested()
  @Type(() => WorkflowNodePositionDto)
  position!: WorkflowNodePositionDto;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  @IsSafeNodeConfig()
  config!: Record<string, unknown>;

  // Per-node "skip during execution" flag set from the canvas. Mirrors the
  // shared `workflowNodeSchema.skipped`. Optional/additive.
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  skipped?: boolean;
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

  // Edge classification for error-handler routing. The SPA emits `kind: 'error'`
  // for edges leaving a node's red error handle. Mirrors the shared
  // `workflowEdgeSchema.kind` enum. Optional/additive.
  @ApiPropertyOptional({ enum: ['success', 'error'] })
  @IsOptional()
  @IsIn(['success', 'error'])
  kind?: 'success' | 'error';
}

export class WorkflowDefinitionDto {
  // Empty `nodes` is valid: new workflows are saved as drafts so the user can
  // pick a trigger from the sidebar before being committed to one. Topology
  // (trigger count, no cycles, no dangling edges) is enforced at execute time.
  @ApiProperty({ type: [WorkflowNodeDto], maxItems: MAX_WORKFLOW_NODES })
  @IsArray()
  @ArrayMaxSize(MAX_WORKFLOW_NODES)
  @ValidateNested({ each: true })
  @Type(() => WorkflowNodeDto)
  nodes!: WorkflowNodeDto[];

  @ApiProperty({ type: [WorkflowEdgeDto], maxItems: MAX_WORKFLOW_EDGES })
  @IsArray()
  @ArrayMaxSize(MAX_WORKFLOW_EDGES)
  @ValidateNested({ each: true })
  @Type(() => WorkflowEdgeDto)
  edges!: WorkflowEdgeDto[];
}
