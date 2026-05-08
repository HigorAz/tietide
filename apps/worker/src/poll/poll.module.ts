import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { CryptoModule } from '../crypto/crypto.module';
import { POLL_QUEUE_NAME } from './poll.constants';
import { PollSchedulerService } from './poll-scheduler.service';
import { PollProcessor } from './poll-processor';
import { PollTriggerRegistry } from './poll-trigger.registry';
import { PollConnectionLoader } from './poll-connection-loader';

@Module({
  imports: [
    PrismaModule,
    CryptoModule,
    BullModule.registerQueue({ name: POLL_QUEUE_NAME }, { name: 'workflow-execution' }),
  ],
  providers: [PollSchedulerService, PollProcessor, PollTriggerRegistry, PollConnectionLoader],
  exports: [PollTriggerRegistry],
})
export class PollModule {}
