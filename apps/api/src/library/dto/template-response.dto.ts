import { ApiProperty } from '@nestjs/swagger';

export class TemplateResponseDto {
  @ApiProperty({ example: 'webhook-conditional-notification' })
  slug!: string;

  @ApiProperty({ example: 'Demo: Webhook → Enrich → IF → Notify' })
  name!: string;

  @ApiProperty({
    example:
      'Inbound webhook payload is enriched via HTTP, then a conditional routes successful responses to a notification call.',
  })
  description!: string;

  @ApiProperty({
    example: 'Webhook',
    description:
      'Display category surfaced on the /library page (e.g., "Webhook", "Schedule", "AI").',
  })
  category!: string;

  @ApiProperty({
    type: [String],
    example: ['webhook-trigger', 'http-request', 'conditional'],
    description:
      'Distinct node types referenced by the underlying definition, used for icon strips on the template card.',
  })
  nodeTypes!: string[];
}
