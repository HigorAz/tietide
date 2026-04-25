import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { CRON_QUEUE_NAME, EXECUTION_QUEUE_NAME } from './cron.constants';
import { CronTriggerService } from './cron-trigger.service';
import { CronProcessor } from './cron-processor';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: CRON_QUEUE_NAME }, { name: EXECUTION_QUEUE_NAME }),
  ],
  providers: [CronTriggerService, CronProcessor],
  exports: [CronTriggerService],
})
export class CronModule {}
