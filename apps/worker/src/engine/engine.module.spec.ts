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
import { OutlookSendAction } from '../nodes/connectors/microsoft/outlook-send';
import { OutlookSearchAction } from '../nodes/connectors/microsoft/outlook-search';
import { OutlookGetMessageAction } from '../nodes/connectors/microsoft/outlook-get-message';
import { ExcelAppendAction } from '../nodes/connectors/microsoft/excel-append';
import { ExcelReadAction } from '../nodes/connectors/microsoft/excel-read';
import { OnedriveCreateAction } from '../nodes/connectors/microsoft/onedrive-create';
import { SlackPostMessageAction } from '../nodes/connectors/slack/slack-post-message';
import { SlackPostToChannelAction } from '../nodes/connectors/slack/slack-post-to-channel';
import { SlackUploadFileAction } from '../nodes/connectors/slack/slack-upload-file';
import { DiscordPostWebhookAction } from '../nodes/connectors/discord/discord-post-webhook';
import { DiscordReplyToCommandAction } from '../nodes/connectors/discord/discord-reply-to-command';
import { TwilioSendSmsAction } from '../nodes/connectors/twilio/twilio-send-sms';
import { TwilioSendWhatsAppAction } from '../nodes/connectors/twilio/twilio-send-whatsapp';
import { TelegramSendMessageAction } from '../nodes/connectors/telegram/telegram-send-message';
import { NotionCreatePageAction } from '../nodes/connectors/notion/notion-create-page';
import { NotionQueryDatabaseAction } from '../nodes/connectors/notion/notion-query-database';
import { TrelloCreateCardAction } from '../nodes/connectors/trello/trello-create-card';
import { TrelloMoveCardAction } from '../nodes/connectors/trello/trello-move-card';
import { AirtableCreateRecordAction } from '../nodes/connectors/airtable/airtable-create-record';
import { AirtableUpdateRecordAction } from '../nodes/connectors/airtable/airtable-update-record';
import { AirtableListRecordsAction } from '../nodes/connectors/airtable/airtable-list-records';
import { LinearCreateIssueAction } from '../nodes/connectors/linear/linear-create-issue';
import { LinearUpdateIssueStatusAction } from '../nodes/connectors/linear/linear-update-issue-status';
import { GitHubCreateIssueAction } from '../nodes/connectors/github/github-create-issue';
import { GitHubCommentIssueAction } from '../nodes/connectors/github/github-comment-issue';
import { GitHubCreatePrAction } from '../nodes/connectors/github/github-create-pr';
import { ClaudeMessagesAction } from '../nodes/connectors/anthropic/claude-messages';
import { OpenaiChatCompletionAction } from '../nodes/connectors/openai/openai-chat-completion';
import { OllamaGenerateAction } from '../nodes/connectors/ollama/ollama-generate';
import { HubspotCreateContactAction } from '../nodes/connectors/hubspot/hubspot-create-contact';
import { HubspotCreateDealAction } from '../nodes/connectors/hubspot/hubspot-create-deal';
import { StripeCreateCustomerAction } from '../nodes/connectors/stripe/stripe-create-customer';
import { StripeListChargesAction } from '../nodes/connectors/stripe/stripe-list-charges';
import { MailchimpAddSubscriberAction } from '../nodes/connectors/mailchimp/mailchimp-add-subscriber';
import { MailchimpSendCampaignAction } from '../nodes/connectors/mailchimp/mailchimp-send-campaign';
import { CalendlyListEventsAction } from '../nodes/connectors/calendly/calendly-list-events';
import { PostgresRunQueryAction } from '../nodes/connectors/postgres/postgres-run-query';
import { MysqlRunQueryAction } from '../nodes/connectors/mysql/mysql-run-query';
import { S3UploadFileAction } from '../nodes/connectors/s3/s3-upload-file';
import { TrelloAddCommentAction } from '../nodes/connectors/trello/trello-add-comment';
import { TrelloUpdateCardAction } from '../nodes/connectors/trello/trello-update-card';
import {
  StripeEventReceivedPassthrough,
  DriveFileAddedPassthrough,
  DriveFileUpdatedPassthrough,
  OutlookMessageReceivedPassthrough,
  OutlookMessageFlaggedPassthrough,
  OnedriveFileAddedPassthrough,
  SlackMessageReceivedPassthrough,
  SlackReactionAddedPassthrough,
  DiscordMessageReceivedPassthrough,
  TelegramMessageReceivedPassthrough,
  TwilioSmsReceivedPassthrough,
  HubspotContactChangedPassthrough,
  MailchimpSubscriberAddedPassthrough,
  CalendlyEventScheduledPassthrough,
  TrelloCardChangedPassthrough,
} from '../nodes/triggers/push/passthrough-push.executor';
import { GmailMessageReceivedExecutor } from '../nodes/triggers/push/gmail-message-received.executor';
import { ExcelRowAddedTrigger } from '../nodes/triggers/poll/excel-row-added';
import { CalendarEventUpdatedTrigger } from '../nodes/triggers/poll/calendar-event-updated';
import { GmailAttachmentReceivedTrigger } from '../nodes/triggers/poll/gmail-attachment-received';
import { EngineModule } from './engine.module';

describe('EngineModule', () => {
  const build = () => {
    const registry = new NodeRegistry();
    const manualTrigger = new ManualTrigger();
    const cronTrigger = new CronTrigger();
    const webhookTrigger = new WebhookTrigger();
    const httpRequest = new HttpRequestAction();
    const codeAction = new CodeAction();
    const conditional = new Conditional();
    const returnNode = new ReturnNode();
    const iteratorNode = new IteratorNode();
    // SubworkflowAction needs PrismaService + EngineService; for the registry-
    // wiring assertions in this spec they're not invoked, so undefined casts
    // are sufficient.
    const subworkflowAction = new SubworkflowAction(undefined as never, undefined as never);
    const gmailSend = new GmailSendAction(undefined as never, undefined as never);
    const gmailSearch = new GmailSearchAction(undefined as never, undefined as never);
    const gmailGetMessage = new GmailGetMessageAction(undefined as never, undefined as never);
    const gmailGetAttachment = new GmailGetAttachmentAction(undefined as never, undefined as never);
    const gmailModifyLabels = new GmailModifyLabelsAction(undefined as never, undefined as never);
    const gmailCreateDraft = new GmailCreateDraftAction(undefined as never, undefined as never);
    const driveCreate = new DriveCreateAction(undefined as never, undefined as never);
    const driveList = new DriveListAction(undefined as never, undefined as never);
    const driveGetFile = new DriveGetFileAction(undefined as never, undefined as never);
    const sheetsAppend = new SheetsAppendAction(undefined as never, undefined as never);
    const sheetsRead = new SheetsReadAction(undefined as never, undefined as never);
    const sheetsFindRow = new SheetsFindRowAction(undefined as never, undefined as never);
    const sheetsUpdateRow = new SheetsUpdateRowAction(undefined as never, undefined as never);
    const sheetsClearRange = new SheetsClearRangeAction(undefined as never, undefined as never);
    const docsCreate = new DocsCreateAction(undefined as never, undefined as never);
    const docsGet = new DocsGetAction(undefined as never, undefined as never);
    const docsInsertText = new DocsInsertTextAction(undefined as never, undefined as never);
    const docsReplaceText = new DocsReplaceTextAction(undefined as never, undefined as never);
    const calendarCreate = new CalendarCreateAction(undefined as never, undefined as never);
    const calendarListEvents = new CalendarListEventsAction(undefined as never, undefined as never);
    const calendarGetEvent = new CalendarGetEventAction(undefined as never, undefined as never);
    const outlookSend = new OutlookSendAction(undefined as never);
    const outlookSearch = new OutlookSearchAction(undefined as never);
    const outlookGetMessage = new OutlookGetMessageAction(undefined as never);
    const excelAppend = new ExcelAppendAction(undefined as never);
    const excelRead = new ExcelReadAction(undefined as never);
    const onedriveCreate = new OnedriveCreateAction(undefined as never);
    const stripeEventReceived = new StripeEventReceivedPassthrough();
    const driveFileAdded = new DriveFileAddedPassthrough();
    const gmailMessageReceived = new GmailMessageReceivedExecutor(
      undefined as never,
      undefined as never,
    );
    const outlookMessageReceived = new OutlookMessageReceivedPassthrough();
    const outlookMessageFlagged = new OutlookMessageFlaggedPassthrough();
    const onedriveFileAdded = new OnedriveFileAddedPassthrough();
    const excelRowAdded = new ExcelRowAddedTrigger(undefined as never);
    const slackPostMessage = new SlackPostMessageAction(undefined as never);
    const slackPostToChannel = new SlackPostToChannelAction(undefined as never);
    const slackUploadFile = new SlackUploadFileAction(undefined as never);
    const discordPostWebhook = new DiscordPostWebhookAction();
    const discordReplyToCommand = new DiscordReplyToCommandAction();
    const twilioSendSms = new TwilioSendSmsAction(undefined as never);
    const twilioSendWhatsApp = new TwilioSendWhatsAppAction(undefined as never);
    const telegramSendMessage = new TelegramSendMessageAction(undefined as never);
    const slackMessageReceived = new SlackMessageReceivedPassthrough();
    const slackReactionAdded = new SlackReactionAddedPassthrough();
    const discordMessageReceived = new DiscordMessageReceivedPassthrough();
    const telegramMessageReceived = new TelegramMessageReceivedPassthrough();
    const twilioSmsReceived = new TwilioSmsReceivedPassthrough();
    const notionCreatePage = new NotionCreatePageAction(undefined as never);
    const notionQueryDatabase = new NotionQueryDatabaseAction(undefined as never);
    const trelloCreateCard = new TrelloCreateCardAction(undefined as never);
    const trelloMoveCard = new TrelloMoveCardAction(undefined as never);
    const airtableCreateRecord = new AirtableCreateRecordAction(undefined as never);
    const airtableUpdateRecord = new AirtableUpdateRecordAction(undefined as never);
    const airtableListRecords = new AirtableListRecordsAction(undefined as never);
    const linearCreateIssue = new LinearCreateIssueAction(undefined as never);
    const linearUpdateIssueStatus = new LinearUpdateIssueStatusAction(undefined as never);
    const githubCreateIssue = new GitHubCreateIssueAction(undefined as never);
    const githubCommentIssue = new GitHubCommentIssueAction(undefined as never);
    const githubCreatePr = new GitHubCreatePrAction(undefined as never);
    const claudeMessages = new ClaudeMessagesAction(undefined as never);
    const openaiChatCompletion = new OpenaiChatCompletionAction(undefined as never);
    const ollamaGenerate = new OllamaGenerateAction(undefined as never);
    const hubspotCreateContact = new HubspotCreateContactAction(undefined as never);
    const hubspotCreateDeal = new HubspotCreateDealAction(undefined as never);
    const stripeCreateCustomer = new StripeCreateCustomerAction(undefined as never);
    const stripeListCharges = new StripeListChargesAction(undefined as never);
    const mailchimpAddSubscriber = new MailchimpAddSubscriberAction(undefined as never);
    const mailchimpSendCampaign = new MailchimpSendCampaignAction(undefined as never);
    const calendlyListEvents = new CalendlyListEventsAction(undefined as never);
    const postgresRunQuery = new PostgresRunQueryAction(undefined as never);
    const mysqlRunQuery = new MysqlRunQueryAction(undefined as never);
    const s3UploadFile = new S3UploadFileAction(undefined as never);
    const trelloAddComment = new TrelloAddCommentAction(undefined as never);
    const trelloUpdateCard = new TrelloUpdateCardAction(undefined as never);
    const hubspotContactChanged = new HubspotContactChangedPassthrough();
    const mailchimpSubscriberAdded = new MailchimpSubscriberAddedPassthrough();
    const calendlyEventScheduled = new CalendlyEventScheduledPassthrough();
    const trelloCardChanged = new TrelloCardChangedPassthrough();
    const calendarEventUpdated = new CalendarEventUpdatedTrigger(
      undefined as never,
      undefined as never,
    );
    const gmailAttachmentReceived = new GmailAttachmentReceivedTrigger(
      undefined as never,
      undefined as never,
    );
    const driveFileUpdated = new DriveFileUpdatedPassthrough();
    const module = new EngineModule(
      registry,
      manualTrigger,
      cronTrigger,
      webhookTrigger,
      httpRequest,
      codeAction,
      conditional,
      returnNode,
      iteratorNode,
      subworkflowAction,
      gmailSend,
      gmailSearch,
      gmailGetMessage,
      gmailGetAttachment,
      gmailModifyLabels,
      gmailCreateDraft,
      driveCreate,
      driveList,
      driveGetFile,
      sheetsAppend,
      sheetsRead,
      sheetsFindRow,
      sheetsUpdateRow,
      sheetsClearRange,
      docsCreate,
      docsGet,
      docsInsertText,
      docsReplaceText,
      calendarCreate,
      calendarListEvents,
      calendarGetEvent,
      outlookSend,
      outlookSearch,
      outlookGetMessage,
      excelAppend,
      excelRead,
      onedriveCreate,
      stripeEventReceived,
      driveFileAdded,
      gmailMessageReceived,
      outlookMessageReceived,
      outlookMessageFlagged,
      onedriveFileAdded,
      excelRowAdded,
      slackPostMessage,
      slackPostToChannel,
      slackUploadFile,
      discordPostWebhook,
      discordReplyToCommand,
      twilioSendSms,
      twilioSendWhatsApp,
      telegramSendMessage,
      slackMessageReceived,
      slackReactionAdded,
      discordMessageReceived,
      telegramMessageReceived,
      twilioSmsReceived,
      notionCreatePage,
      notionQueryDatabase,
      trelloCreateCard,
      trelloMoveCard,
      airtableCreateRecord,
      airtableUpdateRecord,
      airtableListRecords,
      linearCreateIssue,
      linearUpdateIssueStatus,
      githubCreateIssue,
      githubCommentIssue,
      githubCreatePr,
      claudeMessages,
      openaiChatCompletion,
      ollamaGenerate,
      hubspotCreateContact,
      hubspotCreateDeal,
      stripeCreateCustomer,
      stripeListCharges,
      mailchimpAddSubscriber,
      mailchimpSendCampaign,
      calendlyListEvents,
      postgresRunQuery,
      mysqlRunQuery,
      s3UploadFile,
      trelloAddComment,
      trelloUpdateCard,
      hubspotContactChanged,
      mailchimpSubscriberAdded,
      calendlyEventScheduled,
      trelloCardChanged,
      calendarEventUpdated,
      gmailAttachmentReceived,
      driveFileUpdated,
    );
    return {
      registry,
      manualTrigger,
      cronTrigger,
      webhookTrigger,
      httpRequest,
      codeAction,
      conditional,
      returnNode,
      iteratorNode,
      subworkflowAction,
      gmailSend,
      gmailSearch,
      gmailGetMessage,
      gmailGetAttachment,
      gmailModifyLabels,
      gmailCreateDraft,
      driveCreate,
      driveList,
      driveGetFile,
      sheetsAppend,
      sheetsRead,
      sheetsFindRow,
      sheetsUpdateRow,
      sheetsClearRange,
      docsCreate,
      docsGet,
      docsInsertText,
      docsReplaceText,
      calendarCreate,
      calendarListEvents,
      calendarGetEvent,
      outlookSend,
      outlookSearch,
      outlookGetMessage,
      excelAppend,
      excelRead,
      onedriveCreate,
      stripeEventReceived,
      driveFileAdded,
      gmailMessageReceived,
      outlookMessageReceived,
      outlookMessageFlagged,
      onedriveFileAdded,
      excelRowAdded,
      slackPostMessage,
      slackPostToChannel,
      slackUploadFile,
      discordPostWebhook,
      discordReplyToCommand,
      twilioSendSms,
      twilioSendWhatsApp,
      telegramSendMessage,
      slackMessageReceived,
      slackReactionAdded,
      discordMessageReceived,
      telegramMessageReceived,
      twilioSmsReceived,
      notionCreatePage,
      notionQueryDatabase,
      trelloCreateCard,
      trelloMoveCard,
      airtableCreateRecord,
      airtableUpdateRecord,
      airtableListRecords,
      linearCreateIssue,
      linearUpdateIssueStatus,
      githubCreateIssue,
      githubCommentIssue,
      githubCreatePr,
      claudeMessages,
      openaiChatCompletion,
      ollamaGenerate,
      hubspotCreateContact,
      hubspotCreateDeal,
      stripeCreateCustomer,
      stripeListCharges,
      mailchimpAddSubscriber,
      mailchimpSendCampaign,
      calendlyListEvents,
      postgresRunQuery,
      mysqlRunQuery,
      s3UploadFile,
      trelloAddComment,
      trelloUpdateCard,
      hubspotContactChanged,
      mailchimpSubscriberAdded,
      calendlyEventScheduled,
      trelloCardChanged,
      calendarEventUpdated,
      gmailAttachmentReceived,
      driveFileUpdated,
      module,
    };
  };

  describe('onModuleInit', () => {
    it.each([
      ['ManualTrigger', 'manual-trigger', 'manualTrigger'],
      ['CronTrigger', 'cron-trigger', 'cronTrigger'],
      ['WebhookTrigger', 'webhook-trigger', 'webhookTrigger'],
      ['HttpRequestAction', 'http-request', 'httpRequest'],
      ['CodeAction', 'code', 'codeAction'],
      ['Conditional', 'conditional', 'conditional'],
      ['ReturnNode', 'return', 'returnNode'],
      ['IteratorNode', 'iterator', 'iteratorNode'],
      ['SubworkflowAction', 'subworkflow', 'subworkflowAction'],
      ['GmailSendAction', 'gmail-send', 'gmailSend'],
      ['GmailSearchAction', 'gmail-search', 'gmailSearch'],
      ['GmailGetMessageAction', 'gmail-get-message', 'gmailGetMessage'],
      ['GmailGetAttachmentAction', 'gmail-get-attachment', 'gmailGetAttachment'],
      ['GmailModifyLabelsAction', 'gmail-modify-labels', 'gmailModifyLabels'],
      ['GmailCreateDraftAction', 'gmail-create-draft', 'gmailCreateDraft'],
      ['DriveCreateAction', 'drive-create', 'driveCreate'],
      ['DriveListAction', 'drive-list', 'driveList'],
      ['DriveGetFileAction', 'drive-get-file', 'driveGetFile'],
      ['SheetsAppendAction', 'sheets-append', 'sheetsAppend'],
      ['SheetsReadAction', 'sheets-read', 'sheetsRead'],
      ['SheetsFindRowAction', 'sheets-find-row', 'sheetsFindRow'],
      ['SheetsUpdateRowAction', 'sheets-update-row', 'sheetsUpdateRow'],
      ['SheetsClearRangeAction', 'sheets-clear-range', 'sheetsClearRange'],
      ['DocsCreateAction', 'docs-create', 'docsCreate'],
      ['DocsGetAction', 'docs-get', 'docsGet'],
      ['DocsInsertTextAction', 'docs-insert-text', 'docsInsertText'],
      ['DocsReplaceTextAction', 'docs-replace-text', 'docsReplaceText'],
      ['CalendarCreateAction', 'calendar-create', 'calendarCreate'],
      ['CalendarListEventsAction', 'calendar-list-events', 'calendarListEvents'],
      ['CalendarGetEventAction', 'calendar-get-event', 'calendarGetEvent'],
      ['OutlookSendAction', 'outlook-send', 'outlookSend'],
      ['OutlookSearchAction', 'outlook-search', 'outlookSearch'],
      ['OutlookGetMessageAction', 'outlook-get-message', 'outlookGetMessage'],
      ['ExcelAppendAction', 'excel-append', 'excelAppend'],
      ['ExcelReadAction', 'excel-read', 'excelRead'],
      ['OnedriveCreateAction', 'onedrive-create', 'onedriveCreate'],
      ['StripeEventReceivedPassthrough', 'stripe-event-received', 'stripeEventReceived'],
      ['DriveFileAddedPassthrough', 'drive-file-added', 'driveFileAdded'],
      ['GmailMessageReceivedExecutor', 'gmail-message-received', 'gmailMessageReceived'],
      ['OutlookMessageReceivedPassthrough', 'outlook-message-received', 'outlookMessageReceived'],
      ['OutlookMessageFlaggedPassthrough', 'outlook-message-flagged', 'outlookMessageFlagged'],
      ['OnedriveFileAddedPassthrough', 'onedrive-file-added', 'onedriveFileAdded'],
      ['ExcelRowAddedTrigger', 'excel-row-added', 'excelRowAdded'],
      ['SlackPostMessageAction', 'slack-post-message', 'slackPostMessage'],
      ['SlackPostToChannelAction', 'slack-post-to-channel', 'slackPostToChannel'],
      ['SlackUploadFileAction', 'slack-upload-file', 'slackUploadFile'],
      ['DiscordPostWebhookAction', 'discord-post-webhook', 'discordPostWebhook'],
      ['DiscordReplyToCommandAction', 'discord-reply-to-command', 'discordReplyToCommand'],
      ['TwilioSendSmsAction', 'twilio-send-sms', 'twilioSendSms'],
      ['TwilioSendWhatsAppAction', 'twilio-send-whatsapp', 'twilioSendWhatsApp'],
      ['TelegramSendMessageAction', 'telegram-send-message', 'telegramSendMessage'],
      ['SlackMessageReceivedPassthrough', 'slack-message-received', 'slackMessageReceived'],
      ['SlackReactionAddedPassthrough', 'slack-reaction-added', 'slackReactionAdded'],
      ['DiscordMessageReceivedPassthrough', 'discord-message-received', 'discordMessageReceived'],
      [
        'TelegramMessageReceivedPassthrough',
        'telegram-message-received',
        'telegramMessageReceived',
      ],
      ['TwilioSmsReceivedPassthrough', 'twilio-sms-received', 'twilioSmsReceived'],
      ['NotionCreatePageAction', 'notion-create-page', 'notionCreatePage'],
      ['NotionQueryDatabaseAction', 'notion-query-database', 'notionQueryDatabase'],
      ['TrelloCreateCardAction', 'trello-create-card', 'trelloCreateCard'],
      ['TrelloMoveCardAction', 'trello-move-card', 'trelloMoveCard'],
      ['AirtableCreateRecordAction', 'airtable-create-record', 'airtableCreateRecord'],
      ['AirtableUpdateRecordAction', 'airtable-update-record', 'airtableUpdateRecord'],
      ['AirtableListRecordsAction', 'airtable-list-records', 'airtableListRecords'],
      ['LinearCreateIssueAction', 'linear-create-issue', 'linearCreateIssue'],
      ['LinearUpdateIssueStatusAction', 'linear-update-issue-status', 'linearUpdateIssueStatus'],
      ['GitHubCreateIssueAction', 'github-create-issue', 'githubCreateIssue'],
      ['GitHubCommentIssueAction', 'github-comment-issue', 'githubCommentIssue'],
      ['GitHubCreatePrAction', 'github-create-pr', 'githubCreatePr'],
      ['ClaudeMessagesAction', 'claude-messages', 'claudeMessages'],
      ['OpenaiChatCompletionAction', 'openai-chat-completion', 'openaiChatCompletion'],
      ['OllamaGenerateAction', 'ollama-generate', 'ollamaGenerate'],
      ['HubspotCreateContactAction', 'hubspot-create-contact', 'hubspotCreateContact'],
      ['HubspotCreateDealAction', 'hubspot-create-deal', 'hubspotCreateDeal'],
      ['StripeCreateCustomerAction', 'stripe-create-customer', 'stripeCreateCustomer'],
      ['StripeListChargesAction', 'stripe-list-charges', 'stripeListCharges'],
      ['MailchimpAddSubscriberAction', 'mailchimp-add-subscriber', 'mailchimpAddSubscriber'],
      ['MailchimpSendCampaignAction', 'mailchimp-send-campaign', 'mailchimpSendCampaign'],
      ['CalendlyListEventsAction', 'calendly-list-events', 'calendlyListEvents'],
      ['PostgresRunQueryAction', 'postgres-run-query', 'postgresRunQuery'],
      ['MysqlRunQueryAction', 'mysql-run-query', 'mysqlRunQuery'],
      ['S3UploadFileAction', 's3-upload-file', 's3UploadFile'],
      ['TrelloAddCommentAction', 'trello-add-comment', 'trelloAddComment'],
      ['TrelloUpdateCardAction', 'trello-update-card', 'trelloUpdateCard'],
      ['HubspotContactChangedPassthrough', 'hubspot-contact-changed', 'hubspotContactChanged'],
      [
        'MailchimpSubscriberAddedPassthrough',
        'mailchimp-subscriber-added',
        'mailchimpSubscriberAdded',
      ],
      ['CalendlyEventScheduledPassthrough', 'calendly-event-scheduled', 'calendlyEventScheduled'],
      ['TrelloCardChangedPassthrough', 'trello-card-changed', 'trelloCardChanged'],
      ['CalendarEventUpdatedTrigger', 'calendar-event-updated', 'calendarEventUpdated'],
      ['GmailAttachmentReceivedTrigger', 'gmail-attachment-received', 'gmailAttachmentReceived'],
      ['DriveFileUpdatedPassthrough', 'drive-file-updated', 'driveFileUpdated'],
    ])('should register %s in the NodeRegistry', (_label, type, instanceKey) => {
      const built = build();
      built.module.onModuleInit();
      expect(built.registry.has(type)).toBe(true);
      expect(built.registry.resolve(type)).toBe(
        (built as unknown as Record<string, unknown>)[instanceKey],
      );
    });

    it('should expose triggers, actions, and logic executors after init', () => {
      const { registry, module } = build();

      module.onModuleInit();

      const counts = registry.getAll().reduce<Record<string, number>>((acc, e) => {
        acc[e.category] = (acc[e.category] ?? 0) + 1;
        return acc;
      }, {});
      // 6 baseline triggers (manual, cron, webhook, stripe, drive, gmail) +
      // 4 Microsoft triggers (outlook-msg-received, outlook-msg-flagged,
      // onedrive-file-added, excel-row-added) +
      // 5 communication push triggers (slack ×2, discord, telegram, twilio) +
      // 4 commerce/CRM push triggers (hubspot, mailchimp, calendly, trello) +
      // 2 Google poll triggers (calendar-event-updated, gmail-attachment-received) +
      // 1 Google push trigger (drive-file-updated) = 22.
      expect(counts.trigger).toBe(22);
      expect(counts.logic).toBe(4);
      // 2 generic actions (http-request, code) + 21 Google connector actions +
      // 6 Microsoft connector actions +
      // 8 communication actions (slack ×3, discord ×2, twilio ×2, telegram) +
      // 12 productivity actions (notion ×2, trello ×2, airtable ×3,
      //   linear ×2, github ×3) +
      // 3 AI actions (claude-messages, openai-chat-completion, ollama-generate) +
      // 12 commerce/data actions (hubspot ×2, stripe ×2, mailchimp ×2,
      //   calendly, postgres, mysql, s3, trello ×2) = 64.
      expect(counts.action).toBe(64);
    });
  });
});
