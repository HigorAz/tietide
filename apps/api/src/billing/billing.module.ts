import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { EntitlementsService } from './entitlements.service';
import { StripeService } from './stripe.service';
import { BillingService } from './billing.service';
import { SeatSyncService } from './seat-sync.service';
import { SeatSyncProcessor } from './seat-sync.processor';
import { SEAT_SYNC_QUEUE_NAME } from './seat-sync.constants';
import { BillingController } from './billing.controller';
import { BillingWebhookController } from './billing-webhook.controller';

/**
 * Platform billing: entitlement checks (EntitlementsService — used across the app
 * for plan-limit guards) plus the Stripe layer (Checkout, billing portal, webhook
 * sync).
 */
@Module({
  imports: [PrismaModule, ConfigModule, BullModule.registerQueue({ name: SEAT_SYNC_QUEUE_NAME })],
  controllers: [BillingController, BillingWebhookController],
  providers: [
    EntitlementsService,
    StripeService,
    BillingService,
    SeatSyncService,
    SeatSyncProcessor,
  ],
  exports: [EntitlementsService, StripeService, BillingService, SeatSyncService],
})
export class BillingModule {}
