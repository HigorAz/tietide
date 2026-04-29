import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SeededDemoWorkflowDto {
  @ApiProperty({ example: 'webhook-conditional-notification' })
  slug!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  workflowId!: string;

  @ApiProperty({ example: 'Demo: Webhook → Enrich → IF → Notify' })
  name!: string;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: false, description: 'true when this fixture was already seeded earlier' })
  alreadyExisted!: boolean;

  @ApiPropertyOptional({ example: 'webhook-demo-aaaaaaaa' })
  webhookPath?: string;
}

export class DemoSeedResponseDto {
  @ApiProperty({ type: SeededDemoWorkflowDto, isArray: true })
  workflows!: SeededDemoWorkflowDto[];
}
