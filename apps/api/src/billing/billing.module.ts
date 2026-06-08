import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EntitlementsService } from './entitlements.service';

/**
 * Platform billing. Phase 1 exposes only EntitlementsService (plan-limit checks);
 * Stripe (StripeService/BillingService/controllers) and the seat-sync queue land
 * in later phases.
 */
@Module({
  imports: [PrismaModule],
  providers: [EntitlementsService],
  exports: [EntitlementsService],
})
export class BillingModule {}
