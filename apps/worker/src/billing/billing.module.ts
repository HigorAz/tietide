import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkerEntitlementsService } from './worker-entitlements.service';
import { StripeUsageClient } from './stripe-usage.client';
import { UsageReportProcessor } from './usage-report.processor';
import { UsageReportBootstrap } from './usage-report-bootstrap.service';
import { USAGE_REPORT_QUEUE_NAME } from './usage-report.constants';

/**
 * Worker-side billing: run-quota checks for trigger-driven executions
 * (WorkerEntitlementsService) and the daily metered-usage reporter to Stripe.
 */
@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    BullModule.registerQueue({ name: USAGE_REPORT_QUEUE_NAME }),
  ],
  providers: [
    WorkerEntitlementsService,
    StripeUsageClient,
    UsageReportProcessor,
    UsageReportBootstrap,
  ],
  exports: [WorkerEntitlementsService],
})
export class WorkerBillingModule {}
