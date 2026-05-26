import { ApiProperty } from '@nestjs/swagger';

/**
 * Public, non-secret view of a ProviderSubscription. Exposes the callback URL
 * the user must register with the external provider (e.g. Discord's
 * Interactions Endpoint URL). Never includes the signing secret.
 */
export class ProviderSubscriptionResponseDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Subscription id — the path segment in the callback URL',
  })
  id!: string;

  @ApiProperty({ description: 'Workflow trigger node this subscription belongs to' })
  nodeId!: string;

  @ApiProperty({ example: 'discord-bot' })
  provider!: string;

  @ApiProperty({
    description:
      'Public callback URL to register with the provider (e.g. paste into the Discord Developer Portal → Interactions Endpoint URL).',
    example: 'https://tietide.com/v1/provider-webhooks/discord-bot/3f1c…',
  })
  callbackUrl!: string;

  @ApiProperty({ required: false, nullable: true, type: String, format: 'date-time' })
  expiresAt!: string | null;
}
