import { ApiProperty } from '@nestjs/swagger';

export class DocumentationSectionsDto {
  @ApiProperty({ description: 'What the workflow accomplishes and the problem it solves.' })
  overview!: string;

  @ApiProperty({ description: 'Connections, secrets, and env vars the workflow requires to run.' })
  prerequisites!: string;

  @ApiProperty({ description: 'How and when the workflow starts (trigger + config).' })
  trigger!: string;

  @ApiProperty({ description: 'Ordered, node-by-node walkthrough of how the workflow executes.' })
  walkthrough!: string;

  @ApiProperty({ description: 'How data is shaped and passed between nodes.' })
  dataFlow!: string;

  @ApiProperty({ description: 'Conditional branches and routing logic; "None" if none.' })
  decisions!: string;

  @ApiProperty({ description: 'Failure paths, error edges, and retry behavior; "None" if none.' })
  errorHandling!: string;

  // Legacy keys — present only on documentation generated before the redesign.
  @ApiProperty({ required: false, deprecated: true })
  objective?: string;

  @ApiProperty({ required: false, deprecated: true })
  triggers?: string;

  @ApiProperty({ required: false, deprecated: true })
  actions?: string;
}

export class WorkflowDocumentationResponseDto {
  @ApiProperty({ format: 'uuid' })
  workflowId!: string;

  @ApiProperty({ example: 3 })
  version!: number;

  @ApiProperty({
    description: 'Markdown-formatted documentation text returned by the LLM.',
    example: '# Demo workflow\n\nGenerated documentation...',
  })
  documentation!: string;

  @ApiProperty({ type: DocumentationSectionsDto })
  sections!: DocumentationSectionsDto;

  @ApiProperty({ example: 'llama3.1:8b' })
  model!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  generatedAt!: Date;
}
