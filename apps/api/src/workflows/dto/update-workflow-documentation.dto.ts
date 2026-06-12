import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Body for `PATCH /workflows/:id/documentation` — persists a human-edited
 * version of the workflow's documentation. Only the markdown body is editable;
 * the section breakdown is left as generated (a manual edit marks `model` as
 * `manual` so the UI can distinguish it from AI output).
 */
export class UpdateWorkflowDocumentationDto {
  @ApiProperty({
    description: 'Markdown documentation text to persist (overwrites the stored copy).',
    minLength: 1,
    maxLength: 50_000,
    example: '# My workflow\n\nEdited documentation…',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(50_000)
  documentation!: string;
}
