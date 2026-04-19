import { ApiProperty } from '@nestjs/swagger';

export class WorkflowResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'My first workflow' })
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({
    description: 'Workflow definition (nodes and edges) as stored in PostgreSQL JSONB.',
    type: 'object',
    additionalProperties: true,
  })
  definition!: Record<string, unknown>;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ example: 1 })
  version!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({ example: 0, description: 'Number of executions recorded for this workflow.' })
  executionCount!: number;
}
