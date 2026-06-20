import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Candidate output sample for a trigger node, used to populate data-pill
 * mapping without a live webhook (the "Fetch test event" / "Use data from last
 * run" flow). The endpoint never persists the sample — the editor decides
 * whether to adopt it (after a before/after diff).
 */
export class TriggerSampleResponseDto {
  @ApiProperty({
    enum: ['last-run', 'none'],
    description:
      '`last-run` — the sample is the most recent real run’s trigger payload; ' +
      '`none` — no prior real run exists, so the editor should fall back to a built-in example.',
  })
  source!: 'last-run' | 'none';

  @ApiProperty({
    type: 'object',
    nullable: true,
    additionalProperties: true,
    description: 'The candidate trigger output sample, or null when source is `none`.',
  })
  sample!: Record<string, unknown> | null;

  @ApiPropertyOptional({ description: 'Id of the execution the sample was taken from.' })
  executionId?: string;

  @ApiPropertyOptional({ description: 'When the source run occurred (ISO 8601).' })
  capturedAt?: string;
}
