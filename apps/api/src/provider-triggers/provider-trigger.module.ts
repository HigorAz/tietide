import { Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { CryptoModule } from '../crypto/crypto.module';
import { ConnectionsModule } from '../connections/connections.module';
import { ProviderTriggerRegistry } from './provider-trigger.registry';
import { ActivationService, PUBLIC_API_URL_TOKEN } from './activation.service';
import {
  StripeEventReceivedTrigger,
  STRIPE_EVENT_RECEIVED_TYPE,
} from './triggers/stripe-event-received.trigger';
import { StripeClientFactory } from './triggers/stripe-client.factory';

@Module({
  imports: [PrismaModule, CryptoModule, ConnectionsModule],
  providers: [
    ProviderTriggerRegistry,
    StripeClientFactory,
    StripeEventReceivedTrigger,
    ActivationService,
    {
      provide: PUBLIC_API_URL_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService): string | null =>
        config.get<string>('PUBLIC_API_URL') ?? null,
    },
  ],
  exports: [ProviderTriggerRegistry, ActivationService],
})
export class ProviderTriggerModule implements OnModuleInit {
  constructor(
    private readonly registry: ProviderTriggerRegistry,
    private readonly stripeTrigger: StripeEventReceivedTrigger,
  ) {}

  onModuleInit(): void {
    this.registry.register(STRIPE_EVENT_RECEIVED_TYPE, this.stripeTrigger);
  }
}
