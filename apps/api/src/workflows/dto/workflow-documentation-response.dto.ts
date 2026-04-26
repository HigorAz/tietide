import { ApiProperty } from '@nestjs/swagger';

export class DocumentationSectionsDto {
  @ApiProperty()
  objective!: string;

  @ApiProperty()
  triggers!: string;

  @ApiProperty()
  actions!: string;

  @ApiProperty()
  dataFlow!: string;

  @ApiProperty()
  decisions!: string;
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

  @ApiProperty({ description: 'True when result came from cache (workflow unchanged).' })
  cached!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  generatedAt!: Date;
}
