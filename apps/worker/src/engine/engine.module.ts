import { Module, type OnModuleInit } from '@nestjs/common';
import { HttpRequestAction } from '../nodes/actions/http-request';
import { CodeAction } from '../nodes/actions/code';
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
import { IteratorExecutor } from './iterator-executor';
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
import { GmailGetMessageAction } from '../nodes/connectors/google/gmail-get-message';
import { GmailGetAttachmentAction } from '../nodes/connectors/google/gmail-get-attachment';
import { GmailModifyLabelsAction } from '../nodes/connectors/google/gmail-modify-labels';
import { GmailCreateDraftAction } from '../nodes/connectors/google/gmail-create-draft';
import { DriveCreateAction } from '../nodes/connectors/google/drive-create';
import { DriveListAction } from '../nodes/connectors/google/drive-list';
import { DriveGetFileAction } from '../nodes/connectors/google/drive-get-file';
import { SheetsAppendAction } from '../nodes/connectors/google/sheets-append';
import { SheetsReadAction } from '../nodes/connectors/google/sheets-read';
import { SheetsFindRowAction } from '../nodes/connectors/google/sheets-find-row';
import { SheetsUpdateRowAction } from '../nodes/connectors/google/sheets-update-row';
import { SheetsClearRangeAction } from '../nodes/connectors/google/sheets-clear-range';
import { DocsCreateAction } from '../nodes/connectors/google/docs-create';
import { DocsGetAction } from '../nodes/connectors/google/docs-get';
import { DocsInsertTextAction } from '../nodes/connectors/google/docs-insert-text';
import { DocsReplaceTextAction } from '../nodes/connectors/google/docs-replace-text';
import { CalendarCreateAction } from '../nodes/connectors/google/calendar-create';
import { CalendarListEventsAction } from '../nodes/connectors/google/calendar-list-events';
import { CalendarGetEventAction } from '../nodes/connectors/google/calendar-get-event';
import { MicrosoftAuthService } from '../nodes/connectors/microsoft/microsoft-auth';
import { OutlookSendAction } from '../nodes/connectors/microsoft/outlook-send';
import { OutlookSearchAction } from '../nodes/connectors/microsoft/outlook-search';
import { OutlookGetMessageAction } from '../nodes/connectors/microsoft/outlook-get-message';
import { OutlookGetAttachmentAction } from '../nodes/connectors/microsoft/outlook-get-attachment';
import { OutlookUpdateMessageAction } from '../nodes/connectors/microsoft/outlook-update-message';
import { OutlookCreateDraftAction } from '../nodes/connectors/microsoft/outlook-create-draft';
import { ExcelAppendAction } from '../nodes/connectors/microsoft/excel-append';
import { ExcelReadAction } from '../nodes/connectors/microsoft/excel-read';
import { ExcelFindRowAction } from '../nodes/connectors/microsoft/excel-find-row';
import { ExcelUpdateRowAction } from '../nodes/connectors/microsoft/excel-update-row';
import { OnedriveCreateAction } from '../nodes/connectors/microsoft/onedrive-create';
import { OnedriveGetFileAction } from '../nodes/connectors/microsoft/onedrive-get-file';
import { OnedriveListFilesAction } from '../nodes/connectors/microsoft/onedrive-list-files';
import { SlackClientFactory } from '../nodes/connectors/slack/slack-client.factory';
import { SlackPostMessageAction } from '../nodes/connectors/slack/slack-post-message';
import { SlackPostToChannelAction } from '../nodes/connectors/slack/slack-post-to-channel';
import { SlackUploadFileAction } from '../nodes/connectors/slack/slack-upload-file';
import { SlackFindUserAction } from '../nodes/connectors/slack/slack-find-user';
import { SlackSearchMessagesAction } from '../nodes/connectors/slack/slack-search-messages';
import { SlackAddReactionAction } from '../nodes/connectors/slack/slack-add-reaction';
import { SlackCreateChannelAction } from '../nodes/connectors/slack/slack-create-channel';
import { SlackInviteToChannelAction } from '../nodes/connectors/slack/slack-invite-to-channel';
import { SlackGetChannelHistoryAction } from '../nodes/connectors/slack/slack-get-channel-history';
import { SlackUpdateMessageAction } from '../nodes/connectors/slack/slack-update-message';
import { DiscordPostWebhookAction } from '../nodes/connectors/discord/discord-post-webhook';
import { DiscordReplyToCommandAction } from '../nodes/connectors/discord/discord-reply-to-command';
import { DiscordBotClientFactory } from '../nodes/connectors/discord/discord-bot-client.factory';
import { DiscordBotSendMessageAction } from '../nodes/connectors/discord/discord-bot-send-message';
import { DiscordGetChannelMessagesAction } from '../nodes/connectors/discord/discord-get-channel-messages';
import { DiscordAddRoleAction } from '../nodes/connectors/discord/discord-add-role';
import { TwilioClientFactory } from '../nodes/connectors/twilio/twilio-client.factory';
import { TwilioSendSmsAction } from '../nodes/connectors/twilio/twilio-send-sms';
import { TwilioSendWhatsAppAction } from '../nodes/connectors/twilio/twilio-send-whatsapp';
import { TwilioGetMessageAction } from '../nodes/connectors/twilio/twilio-get-message';
import { TwilioListMessagesAction } from '../nodes/connectors/twilio/twilio-list-messages';
import { TwilioMakeCallAction } from '../nodes/connectors/twilio/twilio-make-call';
import { TelegramClientFactory } from '../nodes/connectors/telegram/telegram-client.factory';
import { TelegramSendMessageAction } from '../nodes/connectors/telegram/telegram-send-message';
import { TelegramSendPhotoAction } from '../nodes/connectors/telegram/telegram-send-photo';
import { TelegramSendDocumentAction } from '../nodes/connectors/telegram/telegram-send-document';
import { TelegramEditMessageAction } from '../nodes/connectors/telegram/telegram-edit-message';
import { TelegramGetChatAction } from '../nodes/connectors/telegram/telegram-get-chat';
import { NotionClientFactory } from '../nodes/connectors/notion/notion-client.factory';
import { NotionCreatePageAction } from '../nodes/connectors/notion/notion-create-page';
import { NotionQueryDatabaseAction } from '../nodes/connectors/notion/notion-query-database';
import { NotionGetPageAction } from '../nodes/connectors/notion/notion-get-page';
import { NotionUpdatePageAction } from '../nodes/connectors/notion/notion-update-page';
import { NotionAppendBlocksAction } from '../nodes/connectors/notion/notion-append-blocks';
import { NotionGetBlockChildrenAction } from '../nodes/connectors/notion/notion-get-block-children';
import { NotionFindDatabaseItemAction } from '../nodes/connectors/notion/notion-find-database-item';
import { TrelloClientFactory } from '../nodes/connectors/trello/trello-client.factory';
import { TrelloCreateCardAction } from '../nodes/connectors/trello/trello-create-card';
import { TrelloMoveCardAction } from '../nodes/connectors/trello/trello-move-card';
import { TrelloGetCardAction } from '../nodes/connectors/trello/trello-get-card';
import { TrelloListCardsAction } from '../nodes/connectors/trello/trello-list-cards';
import { TrelloCreateListAction } from '../nodes/connectors/trello/trello-create-list';
import { AirtableClientFactory } from '../nodes/connectors/airtable/airtable-client.factory';
import { AirtableCreateRecordAction } from '../nodes/connectors/airtable/airtable-create-record';
import { AirtableUpdateRecordAction } from '../nodes/connectors/airtable/airtable-update-record';
import { AirtableListRecordsAction } from '../nodes/connectors/airtable/airtable-list-records';
import { AirtableGetRecordAction } from '../nodes/connectors/airtable/airtable-get-record';
import { AirtableFindRecordsAction } from '../nodes/connectors/airtable/airtable-find-records';
import { AirtableDeleteRecordAction } from '../nodes/connectors/airtable/airtable-delete-record';
import { LinearClientFactory } from '../nodes/connectors/linear/linear-client.factory';
import { LinearCreateIssueAction } from '../nodes/connectors/linear/linear-create-issue';
import { LinearUpdateIssueStatusAction } from '../nodes/connectors/linear/linear-update-issue-status';
import { LinearGetIssueAction } from '../nodes/connectors/linear/linear-get-issue';
import { LinearSearchIssuesAction } from '../nodes/connectors/linear/linear-search-issues';
import { LinearAddCommentAction } from '../nodes/connectors/linear/linear-add-comment';
import { GitHubClientFactory } from '../nodes/connectors/github/github-client.factory';
import { GitHubCreateIssueAction } from '../nodes/connectors/github/github-create-issue';
import { GitHubCommentIssueAction } from '../nodes/connectors/github/github-comment-issue';
import { GitHubCreatePrAction } from '../nodes/connectors/github/github-create-pr';
import { GitHubGetIssueAction } from '../nodes/connectors/github/github-get-issue';
import { GitHubListIssuesAction } from '../nodes/connectors/github/github-list-issues';
import { GitHubCloseIssueAction } from '../nodes/connectors/github/github-close-issue';
import { GitHubGetRepoAction } from '../nodes/connectors/github/github-get-repo';
import { GitHubListPrsAction } from '../nodes/connectors/github/github-list-prs';
import { GitHubMergePrAction } from '../nodes/connectors/github/github-merge-pr';
import { ClaudeClientFactory } from '../nodes/connectors/anthropic/claude-client.factory';
import { ClaudeMessagesAction } from '../nodes/connectors/anthropic/claude-messages';
import { OpenaiClientFactory } from '../nodes/connectors/openai/openai-client.factory';
import { OpenaiChatCompletionAction } from '../nodes/connectors/openai/openai-chat-completion';
import { OllamaClientFactory } from '../nodes/connectors/ollama/ollama-client.factory';
import { OllamaGenerateAction } from '../nodes/connectors/ollama/ollama-generate';
import { OpenaiEmbeddingsAction } from '../nodes/connectors/openai/openai-embeddings';
import { OpenaiGenerateImageAction } from '../nodes/connectors/openai/openai-generate-image';
import { AnthropicVisionAction } from '../nodes/connectors/anthropic/anthropic-vision';
import { OllamaEmbeddingsAction } from '../nodes/connectors/ollama/ollama-embeddings';
import { HubspotClientFactory } from '../nodes/connectors/hubspot/hubspot-client.factory';
import { HubspotCreateContactAction } from '../nodes/connectors/hubspot/hubspot-create-contact';
import { HubspotCreateDealAction } from '../nodes/connectors/hubspot/hubspot-create-deal';
import { HubspotFindContactAction } from '../nodes/connectors/hubspot/hubspot-find-contact';
import { HubspotGetContactAction } from '../nodes/connectors/hubspot/hubspot-get-contact';
import { HubspotUpdateContactAction } from '../nodes/connectors/hubspot/hubspot-update-contact';
import { HubspotUpdateDealAction } from '../nodes/connectors/hubspot/hubspot-update-deal';
import { HubspotCreateCompanyAction } from '../nodes/connectors/hubspot/hubspot-create-company';
import { HubspotCreateNoteAction } from '../nodes/connectors/hubspot/hubspot-create-note';
import { StripeClientFactory } from '../nodes/connectors/stripe/stripe-client.factory';
import { StripeCreateCustomerAction } from '../nodes/connectors/stripe/stripe-create-customer';
import { StripeListChargesAction } from '../nodes/connectors/stripe/stripe-list-charges';
import { StripeGetCustomerAction } from '../nodes/connectors/stripe/stripe-get-customer';
import { StripeFindCustomerAction } from '../nodes/connectors/stripe/stripe-find-customer';
import { StripeCreatePaymentIntentAction } from '../nodes/connectors/stripe/stripe-create-payment-intent';
import { StripeCreateRefundAction } from '../nodes/connectors/stripe/stripe-create-refund';
import { StripeListInvoicesAction } from '../nodes/connectors/stripe/stripe-list-invoices';
import { StripeCreateSubscriptionAction } from '../nodes/connectors/stripe/stripe-create-subscription';
import { MailchimpClientFactory } from '../nodes/connectors/mailchimp/mailchimp-client.factory';
import { MailchimpAddSubscriberAction } from '../nodes/connectors/mailchimp/mailchimp-add-subscriber';
import { MailchimpSendCampaignAction } from '../nodes/connectors/mailchimp/mailchimp-send-campaign';
import { MailchimpGetSubscriberAction } from '../nodes/connectors/mailchimp/mailchimp-get-subscriber';
import { MailchimpUpdateSubscriberAction } from '../nodes/connectors/mailchimp/mailchimp-update-subscriber';
import { MailchimpUnsubscribeAction } from '../nodes/connectors/mailchimp/mailchimp-unsubscribe';
import { MailchimpAddTagAction } from '../nodes/connectors/mailchimp/mailchimp-add-tag';
import { MailchimpListCampaignsAction } from '../nodes/connectors/mailchimp/mailchimp-list-campaigns';
import { CalendlyClientFactory } from '../nodes/connectors/calendly/calendly-client.factory';
import { CalendlyListEventsAction } from '../nodes/connectors/calendly/calendly-list-events';
import { CalendlyGetEventAction } from '../nodes/connectors/calendly/calendly-get-event';
import { CalendlyCancelEventAction } from '../nodes/connectors/calendly/calendly-cancel-event';
import { CalendlyListInviteesAction } from '../nodes/connectors/calendly/calendly-list-invitees';
import { PostgresClientFactory } from '../nodes/connectors/postgres/postgres-client.factory';
import { PostgresRunQueryAction } from '../nodes/connectors/postgres/postgres-run-query';
import { MysqlClientFactory } from '../nodes/connectors/mysql/mysql-client.factory';
import { MysqlRunQueryAction } from '../nodes/connectors/mysql/mysql-run-query';
import { S3ClientFactory } from '../nodes/connectors/s3/s3-client.factory';
import { S3UploadFileAction } from '../nodes/connectors/s3/s3-upload-file';
import { S3DownloadFileAction } from '../nodes/connectors/s3/s3-download-file';
import { S3ListObjectsAction } from '../nodes/connectors/s3/s3-list-objects';
import { S3DeleteObjectAction } from '../nodes/connectors/s3/s3-delete-object';
import { S3GetPresignedUrlAction } from '../nodes/connectors/s3/s3-get-presigned-url';
import { TrelloAddCommentAction } from '../nodes/connectors/trello/trello-add-comment';
import { TrelloUpdateCardAction } from '../nodes/connectors/trello/trello-update-card';
import {
  StripeEventReceivedPassthrough,
  DriveFileAddedPassthrough,
  DriveFileUpdatedPassthrough,
  OutlookMessageReceivedPassthrough,
  OutlookMessageFlaggedPassthrough,
  OutlookMessageWithAttachmentPassthrough,
  OnedriveFileAddedPassthrough,
  SlackMessageReceivedPassthrough,
  SlackReactionAddedPassthrough,
  SlackAppMentionPassthrough,
  SlackChannelCreatedPassthrough,
  DiscordMessageReceivedPassthrough,
  TelegramMessageReceivedPassthrough,
  TelegramCallbackQueryReceivedPassthrough,
  TwilioSmsReceivedPassthrough,
  HubspotContactChangedPassthrough,
  MailchimpSubscriberAddedPassthrough,
  CalendlyEventScheduledPassthrough,
  TrelloCardChangedPassthrough,
  GithubIssueOpenedPassthrough,
  GithubPrOpenedPassthrough,
  StripeInvoicePaidPassthrough,
  HubspotDealChangedPassthrough,
} from '../nodes/triggers/push/passthrough-push.executor';
import { GmailMessageReceivedExecutor } from '../nodes/triggers/push/gmail-message-received.executor';
import { SheetsRowAddedTrigger } from '../nodes/triggers/poll/sheets-row-added';
import { GmailLabelAddedTrigger } from '../nodes/triggers/poll/gmail-label-added';
import { CalendarEventCreatedTrigger } from '../nodes/triggers/poll/calendar-event-created';
import { ExcelRowAddedTrigger } from '../nodes/triggers/poll/excel-row-added';
import { ExcelRowUpdatedTrigger } from '../nodes/triggers/poll/excel-row-updated';
import { NotionDatabaseItemUpdatedTrigger } from '../nodes/triggers/poll/notion-database-item-updated';
import { AirtableRecordCreatedTrigger } from '../nodes/triggers/poll/airtable-record-created';
import { LinearIssueUpdatedTrigger } from '../nodes/triggers/poll/linear-issue-updated';
import { CalendarEventUpdatedTrigger } from '../nodes/triggers/poll/calendar-event-updated';
import { GmailAttachmentReceivedTrigger } from '../nodes/triggers/poll/gmail-attachment-received';
import { S3ObjectCreatedTrigger } from '../nodes/triggers/poll/s3-object-created';

@Module({
  imports: [ExecutionEventsModule, OAuthRefreshModule],
  providers: [
    NodeRegistry,
    WorkflowRunner,
    IteratorExecutor,
    EngineService,
    ManualTrigger,
    CronTrigger,
    WebhookTrigger,
    HttpRequestAction,
    CodeAction,
    Conditional,
    ReturnNode,
    IteratorNode,
    SubworkflowAction,
    GoogleAuthService,
    { provide: GOOGLE_CLIENTS, useValue: DEFAULT_GOOGLE_CLIENTS },
    GmailSendAction,
    GmailSearchAction,
    GmailGetMessageAction,
    GmailGetAttachmentAction,
    GmailModifyLabelsAction,
    GmailCreateDraftAction,
    DriveCreateAction,
    DriveListAction,
    DriveGetFileAction,
    SheetsAppendAction,
    SheetsReadAction,
    SheetsFindRowAction,
    SheetsUpdateRowAction,
    SheetsClearRangeAction,
    DocsCreateAction,
    DocsGetAction,
    DocsInsertTextAction,
    DocsReplaceTextAction,
    CalendarCreateAction,
    CalendarListEventsAction,
    CalendarGetEventAction,
    MicrosoftAuthService,
    OutlookSendAction,
    OutlookSearchAction,
    OutlookGetMessageAction,
    OutlookGetAttachmentAction,
    OutlookUpdateMessageAction,
    OutlookCreateDraftAction,
    ExcelAppendAction,
    ExcelReadAction,
    ExcelFindRowAction,
    ExcelUpdateRowAction,
    OnedriveCreateAction,
    OnedriveGetFileAction,
    OnedriveListFilesAction,
    SlackClientFactory,
    SlackPostMessageAction,
    SlackPostToChannelAction,
    SlackUploadFileAction,
    SlackFindUserAction,
    SlackSearchMessagesAction,
    SlackAddReactionAction,
    SlackCreateChannelAction,
    SlackInviteToChannelAction,
    SlackGetChannelHistoryAction,
    SlackUpdateMessageAction,
    DiscordPostWebhookAction,
    DiscordReplyToCommandAction,
    DiscordBotClientFactory,
    DiscordBotSendMessageAction,
    DiscordGetChannelMessagesAction,
    DiscordAddRoleAction,
    TwilioClientFactory,
    TwilioSendSmsAction,
    TwilioSendWhatsAppAction,
    TwilioGetMessageAction,
    TwilioListMessagesAction,
    TwilioMakeCallAction,
    TelegramClientFactory,
    TelegramSendMessageAction,
    TelegramSendPhotoAction,
    TelegramSendDocumentAction,
    TelegramEditMessageAction,
    TelegramGetChatAction,
    NotionClientFactory,
    NotionCreatePageAction,
    NotionQueryDatabaseAction,
    NotionGetPageAction,
    NotionUpdatePageAction,
    NotionAppendBlocksAction,
    NotionGetBlockChildrenAction,
    NotionFindDatabaseItemAction,
    TrelloGetCardAction,
    TrelloListCardsAction,
    TrelloCreateListAction,
    TrelloClientFactory,
    TrelloCreateCardAction,
    TrelloMoveCardAction,
    AirtableClientFactory,
    AirtableCreateRecordAction,
    AirtableUpdateRecordAction,
    AirtableListRecordsAction,
    AirtableGetRecordAction,
    AirtableFindRecordsAction,
    AirtableDeleteRecordAction,
    LinearClientFactory,
    LinearCreateIssueAction,
    LinearUpdateIssueStatusAction,
    LinearGetIssueAction,
    LinearSearchIssuesAction,
    LinearAddCommentAction,
    GitHubClientFactory,
    GitHubCreateIssueAction,
    GitHubCommentIssueAction,
    GitHubCreatePrAction,
    GitHubGetIssueAction,
    GitHubListIssuesAction,
    GitHubCloseIssueAction,
    GitHubGetRepoAction,
    GitHubListPrsAction,
    GitHubMergePrAction,
    NotionDatabaseItemUpdatedTrigger,
    AirtableRecordCreatedTrigger,
    LinearIssueUpdatedTrigger,
    GithubIssueOpenedPassthrough,
    GithubPrOpenedPassthrough,
    ClaudeClientFactory,
    ClaudeMessagesAction,
    OpenaiClientFactory,
    OpenaiChatCompletionAction,
    OllamaClientFactory,
    OllamaGenerateAction,
    OpenaiEmbeddingsAction,
    OpenaiGenerateImageAction,
    AnthropicVisionAction,
    OllamaEmbeddingsAction,
    StripeInvoicePaidPassthrough,
    HubspotDealChangedPassthrough,
    S3ObjectCreatedTrigger,
    HubspotClientFactory,
    HubspotCreateContactAction,
    HubspotCreateDealAction,
    HubspotFindContactAction,
    HubspotGetContactAction,
    HubspotUpdateContactAction,
    HubspotUpdateDealAction,
    HubspotCreateCompanyAction,
    HubspotCreateNoteAction,
    StripeClientFactory,
    StripeCreateCustomerAction,
    StripeListChargesAction,
    StripeGetCustomerAction,
    StripeFindCustomerAction,
    StripeCreatePaymentIntentAction,
    StripeCreateRefundAction,
    StripeListInvoicesAction,
    StripeCreateSubscriptionAction,
    MailchimpClientFactory,
    MailchimpAddSubscriberAction,
    MailchimpSendCampaignAction,
    MailchimpGetSubscriberAction,
    MailchimpUpdateSubscriberAction,
    MailchimpUnsubscribeAction,
    MailchimpAddTagAction,
    MailchimpListCampaignsAction,
    CalendlyClientFactory,
    CalendlyListEventsAction,
    CalendlyGetEventAction,
    CalendlyCancelEventAction,
    CalendlyListInviteesAction,
    PostgresClientFactory,
    PostgresRunQueryAction,
    MysqlClientFactory,
    MysqlRunQueryAction,
    S3ClientFactory,
    S3UploadFileAction,
    S3DownloadFileAction,
    S3ListObjectsAction,
    S3DeleteObjectAction,
    S3GetPresignedUrlAction,
    TrelloAddCommentAction,
    TrelloUpdateCardAction,
    StripeEventReceivedPassthrough,
    DriveFileAddedPassthrough,
    DriveFileUpdatedPassthrough,
    OutlookMessageReceivedPassthrough,
    OutlookMessageFlaggedPassthrough,
    OutlookMessageWithAttachmentPassthrough,
    OnedriveFileAddedPassthrough,
    SlackMessageReceivedPassthrough,
    SlackReactionAddedPassthrough,
    SlackAppMentionPassthrough,
    SlackChannelCreatedPassthrough,
    DiscordMessageReceivedPassthrough,
    TelegramMessageReceivedPassthrough,
    TelegramCallbackQueryReceivedPassthrough,
    TwilioSmsReceivedPassthrough,
    HubspotContactChangedPassthrough,
    MailchimpSubscriberAddedPassthrough,
    CalendlyEventScheduledPassthrough,
    TrelloCardChangedPassthrough,
    GmailMessageReceivedExecutor,
    SheetsRowAddedTrigger,
    GmailLabelAddedTrigger,
    CalendarEventCreatedTrigger,
    ExcelRowAddedTrigger,
    ExcelRowUpdatedTrigger,
    CalendarEventUpdatedTrigger,
    GmailAttachmentReceivedTrigger,
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
    private readonly codeAction: CodeAction,
    private readonly conditional: Conditional,
    private readonly returnNode: ReturnNode,
    private readonly iteratorNode: IteratorNode,
    private readonly subworkflowAction: SubworkflowAction,
    private readonly gmailSend: GmailSendAction,
    private readonly gmailSearch: GmailSearchAction,
    private readonly gmailGetMessage: GmailGetMessageAction,
    private readonly gmailGetAttachment: GmailGetAttachmentAction,
    private readonly gmailModifyLabels: GmailModifyLabelsAction,
    private readonly gmailCreateDraft: GmailCreateDraftAction,
    private readonly driveCreate: DriveCreateAction,
    private readonly driveList: DriveListAction,
    private readonly driveGetFile: DriveGetFileAction,
    private readonly sheetsAppend: SheetsAppendAction,
    private readonly sheetsRead: SheetsReadAction,
    private readonly sheetsFindRow: SheetsFindRowAction,
    private readonly sheetsUpdateRow: SheetsUpdateRowAction,
    private readonly sheetsClearRange: SheetsClearRangeAction,
    private readonly docsCreate: DocsCreateAction,
    private readonly docsGet: DocsGetAction,
    private readonly docsInsertText: DocsInsertTextAction,
    private readonly docsReplaceText: DocsReplaceTextAction,
    private readonly calendarCreate: CalendarCreateAction,
    private readonly calendarListEvents: CalendarListEventsAction,
    private readonly calendarGetEvent: CalendarGetEventAction,
    private readonly outlookSend: OutlookSendAction,
    private readonly outlookSearch: OutlookSearchAction,
    private readonly outlookGetMessage: OutlookGetMessageAction,
    private readonly outlookGetAttachment: OutlookGetAttachmentAction,
    private readonly outlookUpdateMessage: OutlookUpdateMessageAction,
    private readonly outlookCreateDraft: OutlookCreateDraftAction,
    private readonly excelAppend: ExcelAppendAction,
    private readonly excelRead: ExcelReadAction,
    private readonly excelFindRow: ExcelFindRowAction,
    private readonly excelUpdateRow: ExcelUpdateRowAction,
    private readonly onedriveCreate: OnedriveCreateAction,
    private readonly onedriveGetFile: OnedriveGetFileAction,
    private readonly onedriveListFiles: OnedriveListFilesAction,
    private readonly stripeEventReceived: StripeEventReceivedPassthrough,
    private readonly driveFileAdded: DriveFileAddedPassthrough,
    private readonly gmailMessageReceived: GmailMessageReceivedExecutor,
    private readonly outlookMessageReceived: OutlookMessageReceivedPassthrough,
    private readonly outlookMessageFlagged: OutlookMessageFlaggedPassthrough,
    private readonly outlookMessageWithAttachment: OutlookMessageWithAttachmentPassthrough,
    private readonly onedriveFileAdded: OnedriveFileAddedPassthrough,
    private readonly excelRowAdded: ExcelRowAddedTrigger,
    private readonly excelRowUpdated: ExcelRowUpdatedTrigger,
    private readonly slackPostMessage: SlackPostMessageAction,
    private readonly slackPostToChannel: SlackPostToChannelAction,
    private readonly slackUploadFile: SlackUploadFileAction,
    private readonly slackFindUser: SlackFindUserAction,
    private readonly slackSearchMessages: SlackSearchMessagesAction,
    private readonly slackAddReaction: SlackAddReactionAction,
    private readonly slackCreateChannel: SlackCreateChannelAction,
    private readonly slackInviteToChannel: SlackInviteToChannelAction,
    private readonly slackGetChannelHistory: SlackGetChannelHistoryAction,
    private readonly slackUpdateMessage: SlackUpdateMessageAction,
    private readonly discordPostWebhook: DiscordPostWebhookAction,
    private readonly discordReplyToCommand: DiscordReplyToCommandAction,
    private readonly discordBotSendMessage: DiscordBotSendMessageAction,
    private readonly discordGetChannelMessages: DiscordGetChannelMessagesAction,
    private readonly discordAddRole: DiscordAddRoleAction,
    private readonly twilioSendSms: TwilioSendSmsAction,
    private readonly twilioSendWhatsApp: TwilioSendWhatsAppAction,
    private readonly twilioGetMessage: TwilioGetMessageAction,
    private readonly twilioListMessages: TwilioListMessagesAction,
    private readonly twilioMakeCall: TwilioMakeCallAction,
    private readonly telegramSendMessage: TelegramSendMessageAction,
    private readonly telegramSendPhoto: TelegramSendPhotoAction,
    private readonly telegramSendDocument: TelegramSendDocumentAction,
    private readonly telegramEditMessage: TelegramEditMessageAction,
    private readonly telegramGetChat: TelegramGetChatAction,
    private readonly slackMessageReceived: SlackMessageReceivedPassthrough,
    private readonly slackReactionAdded: SlackReactionAddedPassthrough,
    private readonly slackAppMention: SlackAppMentionPassthrough,
    private readonly slackChannelCreated: SlackChannelCreatedPassthrough,
    private readonly discordMessageReceived: DiscordMessageReceivedPassthrough,
    private readonly telegramMessageReceived: TelegramMessageReceivedPassthrough,
    private readonly telegramCallbackQueryReceived: TelegramCallbackQueryReceivedPassthrough,
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
    private readonly claudeMessages: ClaudeMessagesAction,
    private readonly openaiChatCompletion: OpenaiChatCompletionAction,
    private readonly ollamaGenerate: OllamaGenerateAction,
    private readonly hubspotCreateContact: HubspotCreateContactAction,
    private readonly hubspotCreateDeal: HubspotCreateDealAction,
    private readonly stripeCreateCustomer: StripeCreateCustomerAction,
    private readonly stripeListCharges: StripeListChargesAction,
    private readonly mailchimpAddSubscriber: MailchimpAddSubscriberAction,
    private readonly mailchimpSendCampaign: MailchimpSendCampaignAction,
    private readonly calendlyListEvents: CalendlyListEventsAction,
    private readonly postgresRunQuery: PostgresRunQueryAction,
    private readonly mysqlRunQuery: MysqlRunQueryAction,
    private readonly s3UploadFile: S3UploadFileAction,
    private readonly trelloAddComment: TrelloAddCommentAction,
    private readonly trelloUpdateCard: TrelloUpdateCardAction,
    private readonly hubspotContactChanged: HubspotContactChangedPassthrough,
    private readonly mailchimpSubscriberAdded: MailchimpSubscriberAddedPassthrough,
    private readonly calendlyEventScheduled: CalendlyEventScheduledPassthrough,
    private readonly trelloCardChanged: TrelloCardChangedPassthrough,
    private readonly calendarEventUpdated: CalendarEventUpdatedTrigger,
    private readonly gmailAttachmentReceived: GmailAttachmentReceivedTrigger,
    private readonly sheetsRowAdded: SheetsRowAddedTrigger,
    private readonly gmailLabelAdded: GmailLabelAddedTrigger,
    private readonly calendarEventCreated: CalendarEventCreatedTrigger,
    private readonly driveFileUpdated: DriveFileUpdatedPassthrough,
    private readonly notionGetPage: NotionGetPageAction,
    private readonly notionUpdatePage: NotionUpdatePageAction,
    private readonly notionAppendBlocks: NotionAppendBlocksAction,
    private readonly notionGetBlockChildren: NotionGetBlockChildrenAction,
    private readonly notionFindDatabaseItem: NotionFindDatabaseItemAction,
    private readonly trelloGetCard: TrelloGetCardAction,
    private readonly trelloListCards: TrelloListCardsAction,
    private readonly trelloCreateList: TrelloCreateListAction,
    private readonly airtableGetRecord: AirtableGetRecordAction,
    private readonly airtableFindRecords: AirtableFindRecordsAction,
    private readonly airtableDeleteRecord: AirtableDeleteRecordAction,
    private readonly linearGetIssue: LinearGetIssueAction,
    private readonly linearSearchIssues: LinearSearchIssuesAction,
    private readonly linearAddComment: LinearAddCommentAction,
    private readonly githubGetIssue: GitHubGetIssueAction,
    private readonly githubListIssues: GitHubListIssuesAction,
    private readonly githubCloseIssue: GitHubCloseIssueAction,
    private readonly githubGetRepo: GitHubGetRepoAction,
    private readonly githubListPrs: GitHubListPrsAction,
    private readonly githubMergePr: GitHubMergePrAction,
    private readonly notionDbItemUpdated: NotionDatabaseItemUpdatedTrigger,
    private readonly airtableRecordCreated: AirtableRecordCreatedTrigger,
    private readonly linearIssueUpdated: LinearIssueUpdatedTrigger,
    private readonly githubIssueOpened: GithubIssueOpenedPassthrough,
    private readonly githubPrOpened: GithubPrOpenedPassthrough,
    private readonly stripeGetCustomer: StripeGetCustomerAction,
    private readonly stripeFindCustomer: StripeFindCustomerAction,
    private readonly stripeCreatePaymentIntent: StripeCreatePaymentIntentAction,
    private readonly stripeCreateRefund: StripeCreateRefundAction,
    private readonly stripeListInvoices: StripeListInvoicesAction,
    private readonly stripeCreateSubscription: StripeCreateSubscriptionAction,
    private readonly hubspotFindContact: HubspotFindContactAction,
    private readonly hubspotGetContact: HubspotGetContactAction,
    private readonly hubspotUpdateContact: HubspotUpdateContactAction,
    private readonly hubspotUpdateDeal: HubspotUpdateDealAction,
    private readonly hubspotCreateCompany: HubspotCreateCompanyAction,
    private readonly hubspotCreateNote: HubspotCreateNoteAction,
    private readonly mailchimpGetSubscriber: MailchimpGetSubscriberAction,
    private readonly mailchimpUpdateSubscriber: MailchimpUpdateSubscriberAction,
    private readonly mailchimpUnsubscribe: MailchimpUnsubscribeAction,
    private readonly mailchimpAddTag: MailchimpAddTagAction,
    private readonly mailchimpListCampaigns: MailchimpListCampaignsAction,
    private readonly calendlyGetEvent: CalendlyGetEventAction,
    private readonly calendlyCancelEvent: CalendlyCancelEventAction,
    private readonly calendlyListInvitees: CalendlyListInviteesAction,
    private readonly s3DownloadFile: S3DownloadFileAction,
    private readonly s3ListObjects: S3ListObjectsAction,
    private readonly s3DeleteObject: S3DeleteObjectAction,
    private readonly s3GetPresignedUrl: S3GetPresignedUrlAction,
    private readonly openaiEmbeddings: OpenaiEmbeddingsAction,
    private readonly openaiGenerateImage: OpenaiGenerateImageAction,
    private readonly anthropicVision: AnthropicVisionAction,
    private readonly ollamaEmbeddings: OllamaEmbeddingsAction,
    private readonly stripeInvoicePaid: StripeInvoicePaidPassthrough,
    private readonly hubspotDealChanged: HubspotDealChangedPassthrough,
    private readonly s3ObjectCreated: S3ObjectCreatedTrigger,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.manualTrigger);
    this.registry.register(this.cronTrigger);
    this.registry.register(this.webhookTrigger);
    this.registry.register(this.httpRequest);
    this.registry.register(this.codeAction);
    this.registry.register(this.conditional);
    this.registry.register(this.returnNode);
    this.registry.register(this.iteratorNode);
    this.registry.register(this.subworkflowAction);
    this.registry.register(this.gmailSend);
    this.registry.register(this.gmailSearch);
    this.registry.register(this.gmailGetMessage);
    this.registry.register(this.gmailGetAttachment);
    this.registry.register(this.gmailModifyLabels);
    this.registry.register(this.gmailCreateDraft);
    this.registry.register(this.driveCreate);
    this.registry.register(this.driveList);
    this.registry.register(this.driveGetFile);
    this.registry.register(this.sheetsAppend);
    this.registry.register(this.sheetsRead);
    this.registry.register(this.sheetsFindRow);
    this.registry.register(this.sheetsUpdateRow);
    this.registry.register(this.sheetsClearRange);
    this.registry.register(this.docsCreate);
    this.registry.register(this.docsGet);
    this.registry.register(this.docsInsertText);
    this.registry.register(this.docsReplaceText);
    this.registry.register(this.calendarCreate);
    this.registry.register(this.calendarListEvents);
    this.registry.register(this.calendarGetEvent);
    this.registry.register(this.outlookSend);
    this.registry.register(this.outlookSearch);
    this.registry.register(this.outlookGetMessage);
    this.registry.register(this.outlookGetAttachment);
    this.registry.register(this.outlookUpdateMessage);
    this.registry.register(this.outlookCreateDraft);
    this.registry.register(this.excelAppend);
    this.registry.register(this.excelRead);
    this.registry.register(this.excelFindRow);
    this.registry.register(this.excelUpdateRow);
    this.registry.register(this.onedriveCreate);
    this.registry.register(this.onedriveGetFile);
    this.registry.register(this.onedriveListFiles);
    this.registry.register(this.stripeEventReceived);
    this.registry.register(this.driveFileAdded);
    this.registry.register(this.gmailMessageReceived);
    this.registry.register(this.outlookMessageReceived);
    this.registry.register(this.outlookMessageFlagged);
    this.registry.register(this.outlookMessageWithAttachment);
    this.registry.register(this.onedriveFileAdded);
    this.registry.register(this.sheetsRowAdded);
    this.registry.register(this.gmailLabelAdded);
    this.registry.register(this.calendarEventCreated);
    this.registry.register(this.excelRowAdded);
    this.registry.register(this.excelRowUpdated);
    this.registry.register(this.slackPostMessage);
    this.registry.register(this.slackPostToChannel);
    this.registry.register(this.slackUploadFile);
    this.registry.register(this.slackFindUser);
    this.registry.register(this.slackSearchMessages);
    this.registry.register(this.slackAddReaction);
    this.registry.register(this.slackCreateChannel);
    this.registry.register(this.slackInviteToChannel);
    this.registry.register(this.slackGetChannelHistory);
    this.registry.register(this.slackUpdateMessage);
    this.registry.register(this.discordPostWebhook);
    this.registry.register(this.discordReplyToCommand);
    this.registry.register(this.discordBotSendMessage);
    this.registry.register(this.discordGetChannelMessages);
    this.registry.register(this.discordAddRole);
    this.registry.register(this.twilioSendSms);
    this.registry.register(this.twilioSendWhatsApp);
    this.registry.register(this.twilioGetMessage);
    this.registry.register(this.twilioListMessages);
    this.registry.register(this.twilioMakeCall);
    this.registry.register(this.telegramSendMessage);
    this.registry.register(this.telegramSendPhoto);
    this.registry.register(this.telegramSendDocument);
    this.registry.register(this.telegramEditMessage);
    this.registry.register(this.telegramGetChat);
    this.registry.register(this.slackMessageReceived);
    this.registry.register(this.slackReactionAdded);
    this.registry.register(this.slackAppMention);
    this.registry.register(this.slackChannelCreated);
    this.registry.register(this.discordMessageReceived);
    this.registry.register(this.telegramMessageReceived);
    this.registry.register(this.telegramCallbackQueryReceived);
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
    this.registry.register(this.claudeMessages);
    this.registry.register(this.openaiChatCompletion);
    this.registry.register(this.ollamaGenerate);
    this.registry.register(this.hubspotCreateContact);
    this.registry.register(this.hubspotCreateDeal);
    this.registry.register(this.stripeCreateCustomer);
    this.registry.register(this.stripeListCharges);
    this.registry.register(this.mailchimpAddSubscriber);
    this.registry.register(this.mailchimpSendCampaign);
    this.registry.register(this.calendlyListEvents);
    this.registry.register(this.postgresRunQuery);
    this.registry.register(this.mysqlRunQuery);
    this.registry.register(this.s3UploadFile);
    this.registry.register(this.trelloAddComment);
    this.registry.register(this.trelloUpdateCard);
    this.registry.register(this.hubspotContactChanged);
    this.registry.register(this.mailchimpSubscriberAdded);
    this.registry.register(this.calendlyEventScheduled);
    this.registry.register(this.trelloCardChanged);
    this.registry.register(this.calendarEventUpdated);
    this.registry.register(this.gmailAttachmentReceived);
    this.registry.register(this.driveFileUpdated);
    this.registry.register(this.notionGetPage);
    this.registry.register(this.notionUpdatePage);
    this.registry.register(this.notionAppendBlocks);
    this.registry.register(this.notionGetBlockChildren);
    this.registry.register(this.notionFindDatabaseItem);
    this.registry.register(this.trelloGetCard);
    this.registry.register(this.trelloListCards);
    this.registry.register(this.trelloCreateList);
    this.registry.register(this.airtableGetRecord);
    this.registry.register(this.airtableFindRecords);
    this.registry.register(this.airtableDeleteRecord);
    this.registry.register(this.linearGetIssue);
    this.registry.register(this.linearSearchIssues);
    this.registry.register(this.linearAddComment);
    this.registry.register(this.githubGetIssue);
    this.registry.register(this.githubListIssues);
    this.registry.register(this.githubCloseIssue);
    this.registry.register(this.githubGetRepo);
    this.registry.register(this.githubListPrs);
    this.registry.register(this.githubMergePr);
    this.registry.register(this.notionDbItemUpdated);
    this.registry.register(this.airtableRecordCreated);
    this.registry.register(this.linearIssueUpdated);
    this.registry.register(this.githubIssueOpened);
    this.registry.register(this.githubPrOpened);
    this.registry.register(this.stripeGetCustomer);
    this.registry.register(this.stripeFindCustomer);
    this.registry.register(this.stripeCreatePaymentIntent);
    this.registry.register(this.stripeCreateRefund);
    this.registry.register(this.stripeListInvoices);
    this.registry.register(this.stripeCreateSubscription);
    this.registry.register(this.hubspotFindContact);
    this.registry.register(this.hubspotGetContact);
    this.registry.register(this.hubspotUpdateContact);
    this.registry.register(this.hubspotUpdateDeal);
    this.registry.register(this.hubspotCreateCompany);
    this.registry.register(this.hubspotCreateNote);
    this.registry.register(this.mailchimpGetSubscriber);
    this.registry.register(this.mailchimpUpdateSubscriber);
    this.registry.register(this.mailchimpUnsubscribe);
    this.registry.register(this.mailchimpAddTag);
    this.registry.register(this.mailchimpListCampaigns);
    this.registry.register(this.calendlyGetEvent);
    this.registry.register(this.calendlyCancelEvent);
    this.registry.register(this.calendlyListInvitees);
    this.registry.register(this.s3DownloadFile);
    this.registry.register(this.s3ListObjects);
    this.registry.register(this.s3DeleteObject);
    this.registry.register(this.s3GetPresignedUrl);
    this.registry.register(this.openaiEmbeddings);
    this.registry.register(this.openaiGenerateImage);
    this.registry.register(this.anthropicVision);
    this.registry.register(this.ollamaEmbeddings);
    this.registry.register(this.stripeInvoicePaid);
    this.registry.register(this.hubspotDealChanged);
    this.registry.register(this.s3ObjectCreated);
  }
}
