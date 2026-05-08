import { Module, type OnModuleInit } from '@nestjs/common';
import { HttpRequestAction } from '../nodes/actions/http-request';
import { Conditional } from '../nodes/logic/conditional';
import { IteratorNode } from '../nodes/logic/iterator';
import { ReturnNode } from '../nodes/logic/return';
import { SubworkflowAction } from '../nodes/logic/subworkflow';
import { NodeRegistry } from '../nodes/registry';
import { ManualTrigger } from '../nodes/triggers/manual-trigger';
import { CronTrigger } from '../nodes/triggers/cron-trigger';
import { WebhookTrigger } from '../nodes/triggers/webhook-trigger';
import { ExecutionEventsModule } from '../events/execution-events.module';
import { EngineService } from './engine.service';
import { WorkflowRunner } from './workflow-runner';
import { SECRET_RESOLVER } from './secret-resolver';
import { PrismaSecretResolver } from './prisma-secret-resolver';
import { ENV_VAR_RESOLVER } from './env-var-resolver';
import { PrismaEnvVarResolver } from './prisma-env-var-resolver';
import { CONNECTION_RESOLVER } from '../connections/connection-resolver';
import { PrismaConnectionResolver } from '../connections/prisma-connection-resolver';
import { OAuthRefreshModule } from '../connections/refresh/oauth-refresh.module';
import {
  DEFAULT_GOOGLE_CLIENTS,
  GOOGLE_CLIENTS,
  GoogleAuthService,
} from '../nodes/connectors/google/google-auth';
import { GmailSendAction } from '../nodes/connectors/google/gmail-send';
import { GmailSearchAction } from '../nodes/connectors/google/gmail-search';
import { DriveCreateAction } from '../nodes/connectors/google/drive-create';
import { DriveListAction } from '../nodes/connectors/google/drive-list';
import { SheetsAppendAction } from '../nodes/connectors/google/sheets-append';
import { SheetsReadAction } from '../nodes/connectors/google/sheets-read';
import { DocsCreateAction } from '../nodes/connectors/google/docs-create';
import { CalendarCreateAction } from '../nodes/connectors/google/calendar-create';
import { MicrosoftAuthService } from '../nodes/connectors/microsoft/microsoft-auth';
import { OutlookSendAction } from '../nodes/connectors/microsoft/outlook-send';
import { OutlookSearchAction } from '../nodes/connectors/microsoft/outlook-search';
import { ExcelAppendAction } from '../nodes/connectors/microsoft/excel-append';
import { ExcelReadAction } from '../nodes/connectors/microsoft/excel-read';
import { OnedriveCreateAction } from '../nodes/connectors/microsoft/onedrive-create';
import {
  StripeEventReceivedPassthrough,
  DriveFileAddedPassthrough,
} from '../nodes/triggers/push/passthrough-push.executor';

@Module({
  imports: [ExecutionEventsModule, OAuthRefreshModule],
  providers: [
    NodeRegistry,
    WorkflowRunner,
    EngineService,
    ManualTrigger,
    CronTrigger,
    WebhookTrigger,
    HttpRequestAction,
    Conditional,
    ReturnNode,
    IteratorNode,
    SubworkflowAction,
    GoogleAuthService,
    { provide: GOOGLE_CLIENTS, useValue: DEFAULT_GOOGLE_CLIENTS },
    GmailSendAction,
    GmailSearchAction,
    DriveCreateAction,
    DriveListAction,
    SheetsAppendAction,
    SheetsReadAction,
    DocsCreateAction,
    CalendarCreateAction,
    MicrosoftAuthService,
    OutlookSendAction,
    OutlookSearchAction,
    ExcelAppendAction,
    ExcelReadAction,
    OnedriveCreateAction,
    StripeEventReceivedPassthrough,
    DriveFileAddedPassthrough,
    { provide: SECRET_RESOLVER, useClass: PrismaSecretResolver },
    { provide: ENV_VAR_RESOLVER, useClass: PrismaEnvVarResolver },
    { provide: CONNECTION_RESOLVER, useClass: PrismaConnectionResolver },
  ],
  exports: [EngineService, NodeRegistry],
})
export class EngineModule implements OnModuleInit {
  constructor(
    private readonly registry: NodeRegistry,
    private readonly manualTrigger: ManualTrigger,
    private readonly cronTrigger: CronTrigger,
    private readonly webhookTrigger: WebhookTrigger,
    private readonly httpRequest: HttpRequestAction,
    private readonly conditional: Conditional,
    private readonly returnNode: ReturnNode,
    private readonly iteratorNode: IteratorNode,
    private readonly subworkflowAction: SubworkflowAction,
    private readonly gmailSend: GmailSendAction,
    private readonly gmailSearch: GmailSearchAction,
    private readonly driveCreate: DriveCreateAction,
    private readonly driveList: DriveListAction,
    private readonly sheetsAppend: SheetsAppendAction,
    private readonly sheetsRead: SheetsReadAction,
    private readonly docsCreate: DocsCreateAction,
    private readonly calendarCreate: CalendarCreateAction,
    private readonly outlookSend: OutlookSendAction,
    private readonly outlookSearch: OutlookSearchAction,
    private readonly excelAppend: ExcelAppendAction,
    private readonly excelRead: ExcelReadAction,
    private readonly onedriveCreate: OnedriveCreateAction,
    private readonly stripeEventReceived: StripeEventReceivedPassthrough,
    private readonly driveFileAdded: DriveFileAddedPassthrough,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.manualTrigger);
    this.registry.register(this.cronTrigger);
    this.registry.register(this.webhookTrigger);
    this.registry.register(this.httpRequest);
    this.registry.register(this.conditional);
    this.registry.register(this.returnNode);
    this.registry.register(this.iteratorNode);
    this.registry.register(this.subworkflowAction);
    this.registry.register(this.gmailSend);
    this.registry.register(this.gmailSearch);
    this.registry.register(this.driveCreate);
    this.registry.register(this.driveList);
    this.registry.register(this.sheetsAppend);
    this.registry.register(this.sheetsRead);
    this.registry.register(this.docsCreate);
    this.registry.register(this.calendarCreate);
    this.registry.register(this.outlookSend);
    this.registry.register(this.outlookSearch);
    this.registry.register(this.excelAppend);
    this.registry.register(this.excelRead);
    this.registry.register(this.onedriveCreate);
    this.registry.register(this.stripeEventReceived);
    this.registry.register(this.driveFileAdded);
  }
}
