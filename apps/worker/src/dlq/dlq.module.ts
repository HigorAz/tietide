import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DlqService } from './dlq.service';
import { DLQ_QUEUE_NAME } from './dlq.constants';

@Module({
  imports: [BullModule.registerQueue({ name: DLQ_QUEUE_NAME })],
  providers: [DlqService],
  exports: [DlqService, BullModule],
})
export class DlqModule {}
