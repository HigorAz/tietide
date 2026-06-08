import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { CryptoModule } from '../crypto/crypto.module';
import { ProviderTriggerModule } from '../provider-triggers/provider-trigger.module';
import { BillingModule } from '../billing/billing.module';
import { EXECUTION_QUEUE_NAME } from '../executions/execution-queue.constants';
import { ProviderWebhooksController } from './provider-webhooks.controller';
import { ProviderWebhooksService } from './provider-webhooks.service';

@Module({
  imports: [
    PrismaModule,
    CryptoModule,
    ProviderTriggerModule,
    BillingModule,
    BullModule.registerQueue({ name: EXECUTION_QUEUE_NAME }),
  ],
  controllers: [ProviderWebhooksController],
  providers: [ProviderWebhooksService],
})
export class ProviderWebhooksModule {}
