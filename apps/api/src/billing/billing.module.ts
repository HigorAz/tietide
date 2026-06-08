import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { EntitlementsService } from './entitlements.service';
import { StripeService } from './stripe.service';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { BillingWebhookController } from './billing-webhook.controller';

/**
 * Platform billing: entitlement checks (EntitlementsService — used across the app
 * for plan-limit guards) plus the Stripe layer (Checkout, billing portal, webhook
 * sync).
 */
@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [BillingController, BillingWebhookController],
  providers: [EntitlementsService, StripeService, BillingService],
  exports: [EntitlementsService, StripeService, BillingService],
})
export class BillingModule {}
