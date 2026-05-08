import { Module, type OnModuleInit } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { CryptoModule } from '../crypto/crypto.module';
import { OAuthRefreshModule } from '../connections/refresh/oauth-refresh.module';
import {
  DEFAULT_GOOGLE_CLIENTS,
  GOOGLE_CLIENTS,
  GoogleAuthService,
} from '../nodes/connectors/google/google-auth';
import {
  SheetsRowAddedTrigger,
  SHEETS_ROW_ADDED_TYPE,
} from '../nodes/triggers/poll/sheets-row-added';
import { POLL_QUEUE_NAME } from './poll.constants';
import { PollSchedulerService } from './poll-scheduler.service';
import { PollProcessor } from './poll-processor';
import { PollTriggerRegistry } from './poll-trigger.registry';
import { PollConnectionLoader } from './poll-connection-loader';

@Module({
  imports: [
    PrismaModule,
    CryptoModule,
    OAuthRefreshModule,
    BullModule.registerQueue({ name: POLL_QUEUE_NAME }, { name: 'workflow-execution' }),
  ],
  providers: [
    PollSchedulerService,
    PollProcessor,
    PollTriggerRegistry,
    PollConnectionLoader,
    GoogleAuthService,
    { provide: GOOGLE_CLIENTS, useValue: DEFAULT_GOOGLE_CLIENTS },
    SheetsRowAddedTrigger,
  ],
  exports: [PollTriggerRegistry],
})
export class PollModule implements OnModuleInit {
  constructor(
    private readonly registry: PollTriggerRegistry,
    private readonly sheetsRowAdded: SheetsRowAddedTrigger,
  ) {}

  onModuleInit(): void {
    this.registry.register(SHEETS_ROW_ADDED_TYPE, this.sheetsRowAdded);
  }
}
