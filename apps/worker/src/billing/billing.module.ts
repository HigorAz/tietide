import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkerEntitlementsService } from './worker-entitlements.service';

/** Worker-side run-quota checks for trigger-driven executions (cron, poll). */
@Module({
  imports: [PrismaModule],
  providers: [WorkerEntitlementsService],
  exports: [WorkerEntitlementsService],
})
export class WorkerBillingModule {}
