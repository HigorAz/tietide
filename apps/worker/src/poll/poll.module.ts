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
import {
  CalendarEventCreatedTrigger,
  CALENDAR_EVENT_CREATED_TYPE,
} from '../nodes/triggers/poll/calendar-event-created';
import {
  CalendarEventUpdatedTrigger,
  CALENDAR_EVENT_UPDATED_TYPE,
} from '../nodes/triggers/poll/calendar-event-updated';
import {
  GmailLabelAddedTrigger,
  GMAIL_LABEL_ADDED_TYPE,
} from '../nodes/triggers/poll/gmail-label-added';
import { ExcelRowAddedTrigger, EXCEL_ROW_ADDED_TYPE } from '../nodes/triggers/poll/excel-row-added';
import { MicrosoftAuthService } from '../nodes/connectors/microsoft/microsoft-auth';
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
    CalendarEventCreatedTrigger,
    CalendarEventUpdatedTrigger,
    GmailLabelAddedTrigger,
    MicrosoftAuthService,
    ExcelRowAddedTrigger,
  ],
  exports: [PollTriggerRegistry],
})
export class PollModule implements OnModuleInit {
  constructor(
    private readonly registry: PollTriggerRegistry,
    private readonly sheetsRowAdded: SheetsRowAddedTrigger,
    private readonly calendarEventCreated: CalendarEventCreatedTrigger,
    private readonly calendarEventUpdated: CalendarEventUpdatedTrigger,
    private readonly gmailLabelAdded: GmailLabelAddedTrigger,
    private readonly excelRowAdded: ExcelRowAddedTrigger,
  ) {}

  onModuleInit(): void {
    this.registry.register(SHEETS_ROW_ADDED_TYPE, this.sheetsRowAdded);
    this.registry.register(CALENDAR_EVENT_CREATED_TYPE, this.calendarEventCreated);
    this.registry.register(CALENDAR_EVENT_UPDATED_TYPE, this.calendarEventUpdated);
    this.registry.register(GMAIL_LABEL_ADDED_TYPE, this.gmailLabelAdded);
    this.registry.register(EXCEL_ROW_ADDED_TYPE, this.excelRowAdded);
  }
}
