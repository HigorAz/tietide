import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { RETENTION_QUEUE } from './retention.constants';
import { RetentionScheduler } from './retention.scheduler';
import { RetentionProcessor } from './retention.processor';

@Module({
  imports: [PrismaModule, BullModule.registerQueue({ name: RETENTION_QUEUE })],
  providers: [RetentionScheduler, RetentionProcessor],
})
export class RetentionModule {}
