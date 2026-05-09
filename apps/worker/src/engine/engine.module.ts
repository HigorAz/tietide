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
import { SlackClientFactory } from '../nodes/connectors/slack/slack-client.factory';
import { SlackPostMessageAction } from '../nodes/connectors/slack/slack-post-message';
import { SlackPostToChannelAction } from '../nodes/connectors/slack/slack-post-to-channel';
import { SlackUploadFileAction } from '../nodes/connectors/slack/slack-upload-file';
import { DiscordPostWebhookAction } from '../nodes/connectors/discord/discord-post-webhook';
import { TwilioClientFactory } from '../nodes/connectors/twilio/twilio-client.factory';
import { TwilioSendSmsAction } from '../nodes/connectors/twilio/twilio-send-sms';
import { TwilioSendWhatsAppAction } from '../nodes/connectors/twilio/twilio-send-whatsapp';
import { TelegramClientFactory } from '../nodes/connectors/telegram/telegram-client.factory';
import { TelegramSendMessageAction } from '../nodes/connectors/telegram/telegram-send-message';
import { NotionClientFactory } from '../nodes/connectors/notion/notion-client.factory';
import { NotionCreatePageAction } from '../nodes/connectors/notion/notion-create-page';
import { NotionQueryDatabaseAction } from '../nodes/connectors/notion/notion-query-database';
import { TrelloClientFactory } from '../nodes/connectors/trello/trello-client.factory';
import { TrelloCreateCardAction } from '../nodes/connectors/trello/trello-create-card';
import { TrelloMoveCardAction } from '../nodes/connectors/trello/trello-move-card';
import { AirtableClientFactory } from '../nodes/connectors/airtable/airtable-client.factory';
import { AirtableCreateRecordAction } from '../nodes/connectors/airtable/airtable-create-record';
import { AirtableUpdateRecordAction } from '../nodes/connectors/airtable/airtable-update-record';
import { AirtableListRecordsAction } from '../nodes/connectors/airtable/airtable-list-records';
import { LinearClientFactory } from '../nodes/connectors/linear/linear-client.factory';
import { LinearCreateIssueAction } from '../nodes/connectors/linear/linear-create-issue';
import { LinearUpdateIssueStatusAction } from '../nodes/connectors/linear/linear-update-issue-status';
import { GitHubClientFactory } from '../nodes/connectors/github/github-client.factory';
import { GitHubCreateIssueAction } from '../nodes/connectors/github/github-create-issue';
import { GitHubCommentIssueAction } from '../nodes/connectors/github/github-comment-issue';
import { GitHubCreatePrAction } from '../nodes/connectors/github/github-create-pr';
import {
  StripeEventReceivedPassthrough,
  DriveFileAddedPassthrough,
  OutlookMessageReceivedPassthrough,
  OutlookMessageFlaggedPassthrough,
  OnedriveFileAddedPassthrough,
  SlackMessageReceivedPassthrough,
  SlackReactionAddedPassthrough,
  DiscordMessageReceivedPassthrough,
  TelegramMessageReceivedPassthrough,
  TwilioSmsReceivedPassthrough,
} from '../nodes/triggers/push/passthrough-push.executor';
import { GmailMessageReceivedExecutor } from '../nodes/triggers/push/gmail-message-received.executor';
import { ExcelRowAddedTrigger } from '../nodes/triggers/poll/excel-row-added';

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
    SlackClientFactory,
    SlackPostMessageAction,
    SlackPostToChannelAction,
    SlackUploadFileAction,
    DiscordPostWebhookAction,
    TwilioClientFactory,
    TwilioSendSmsAction,
    TwilioSendWhatsAppAction,
    TelegramClientFactory,
    TelegramSendMessageAction,
    NotionClientFactory,
    NotionCreatePageAction,
    NotionQueryDatabaseAction,
    TrelloClientFactory,
    TrelloCreateCardAction,
    TrelloMoveCardAction,
    AirtableClientFactory,
    AirtableCreateRecordAction,
    AirtableUpdateRecordAction,
    AirtableListRecordsAction,
    LinearClientFactory,
    LinearCreateIssueAction,
    LinearUpdateIssueStatusAction,
    GitHubClientFactory,
    GitHubCreateIssueAction,
    GitHubCommentIssueAction,
    GitHubCreatePrAction,
    StripeEventReceivedPassthrough,
    DriveFileAddedPassthrough,
    OutlookMessageReceivedPassthrough,
    OutlookMessageFlaggedPassthrough,
    OnedriveFileAddedPassthrough,
    SlackMessageReceivedPassthrough,
    SlackReactionAddedPassthrough,
    DiscordMessageReceivedPassthrough,
    TelegramMessageReceivedPassthrough,
    TwilioSmsReceivedPassthrough,
    GmailMessageReceivedExecutor,
    ExcelRowAddedTrigger,
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
    private readonly gmailMessageReceived: GmailMessageReceivedExecutor,
    private readonly outlookMessageReceived: OutlookMessageReceivedPassthrough,
    private readonly outlookMessageFlagged: OutlookMessageFlaggedPassthrough,
    private readonly onedriveFileAdded: OnedriveFileAddedPassthrough,
    private readonly excelRowAdded: ExcelRowAddedTrigger,
    private readonly slackPostMessage: SlackPostMessageAction,
    private readonly slackPostToChannel: SlackPostToChannelAction,
    private readonly slackUploadFile: SlackUploadFileAction,
    private readonly discordPostWebhook: DiscordPostWebhookAction,
    private readonly twilioSendSms: TwilioSendSmsAction,
    private readonly twilioSendWhatsApp: TwilioSendWhatsAppAction,
    private readonly telegramSendMessage: TelegramSendMessageAction,
    private readonly slackMessageReceived: SlackMessageReceivedPassthrough,
    private readonly slackReactionAdded: SlackReactionAddedPassthrough,
    private readonly discordMessageReceived: DiscordMessageReceivedPassthrough,
    private readonly telegramMessageReceived: TelegramMessageReceivedPassthrough,
    private readonly twilioSmsReceived: TwilioSmsReceivedPassthrough,
    private readonly notionCreatePage: NotionCreatePageAction,
    private readonly notionQueryDatabase: NotionQueryDatabaseAction,
    private readonly trelloCreateCard: TrelloCreateCardAction,
    private readonly trelloMoveCard: TrelloMoveCardAction,
    private readonly airtableCreateRecord: AirtableCreateRecordAction,
    private readonly airtableUpdateRecord: AirtableUpdateRecordAction,
    private readonly airtableListRecords: AirtableListRecordsAction,
    private readonly linearCreateIssue: LinearCreateIssueAction,
    private readonly linearUpdateIssueStatus: LinearUpdateIssueStatusAction,
    private readonly githubCreateIssue: GitHubCreateIssueAction,
    private readonly githubCommentIssue: GitHubCommentIssueAction,
    private readonly githubCreatePr: GitHubCreatePrAction,
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
    this.registry.register(this.gmailMessageReceived);
    this.registry.register(this.outlookMessageReceived);
    this.registry.register(this.outlookMessageFlagged);
    this.registry.register(this.onedriveFileAdded);
    this.registry.register(this.excelRowAdded);
    this.registry.register(this.slackPostMessage);
    this.registry.register(this.slackPostToChannel);
    this.registry.register(this.slackUploadFile);
    this.registry.register(this.discordPostWebhook);
    this.registry.register(this.twilioSendSms);
    this.registry.register(this.twilioSendWhatsApp);
    this.registry.register(this.telegramSendMessage);
    this.registry.register(this.slackMessageReceived);
    this.registry.register(this.slackReactionAdded);
    this.registry.register(this.discordMessageReceived);
    this.registry.register(this.telegramMessageReceived);
    this.registry.register(this.twilioSmsReceived);
    this.registry.register(this.notionCreatePage);
    this.registry.register(this.notionQueryDatabase);
    this.registry.register(this.trelloCreateCard);
    this.registry.register(this.trelloMoveCard);
    this.registry.register(this.airtableCreateRecord);
    this.registry.register(this.airtableUpdateRecord);
    this.registry.register(this.airtableListRecords);
    this.registry.register(this.linearCreateIssue);
    this.registry.register(this.linearUpdateIssueStatus);
    this.registry.register(this.githubCreateIssue);
    this.registry.register(this.githubCommentIssue);
    this.registry.register(this.githubCreatePr);
  }
}
