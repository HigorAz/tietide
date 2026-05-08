import { HttpRequestAction } from '../nodes/actions/http-request';
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
import { DriveCreateAction } from '../nodes/connectors/google/drive-create';
import { DriveListAction } from '../nodes/connectors/google/drive-list';
import { SheetsAppendAction } from '../nodes/connectors/google/sheets-append';
import { SheetsReadAction } from '../nodes/connectors/google/sheets-read';
import { DocsCreateAction } from '../nodes/connectors/google/docs-create';
import { CalendarCreateAction } from '../nodes/connectors/google/calendar-create';
import { OutlookSendAction } from '../nodes/connectors/microsoft/outlook-send';
import { OutlookSearchAction } from '../nodes/connectors/microsoft/outlook-search';
import { ExcelAppendAction } from '../nodes/connectors/microsoft/excel-append';
import { ExcelReadAction } from '../nodes/connectors/microsoft/excel-read';
import { OnedriveCreateAction } from '../nodes/connectors/microsoft/onedrive-create';
import { SlackPostMessageAction } from '../nodes/connectors/slack/slack-post-message';
import { SlackPostToChannelAction } from '../nodes/connectors/slack/slack-post-to-channel';
import { SlackUploadFileAction } from '../nodes/connectors/slack/slack-upload-file';
import { DiscordPostWebhookAction } from '../nodes/connectors/discord/discord-post-webhook';
import { TwilioSendSmsAction } from '../nodes/connectors/twilio/twilio-send-sms';
import { TwilioSendWhatsAppAction } from '../nodes/connectors/twilio/twilio-send-whatsapp';
import { TelegramSendMessageAction } from '../nodes/connectors/telegram/telegram-send-message';
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
import { EngineModule } from './engine.module';

describe('EngineModule', () => {
  const build = () => {
    const registry = new NodeRegistry();
    const manualTrigger = new ManualTrigger();
    const cronTrigger = new CronTrigger();
    const webhookTrigger = new WebhookTrigger();
    const httpRequest = new HttpRequestAction();
    const conditional = new Conditional();
    const returnNode = new ReturnNode();
    const iteratorNode = new IteratorNode();
    // SubworkflowAction needs PrismaService + EngineService; for the registry-
    // wiring assertions in this spec they're not invoked, so undefined casts
    // are sufficient.
    const subworkflowAction = new SubworkflowAction(undefined as never, undefined as never);
    const gmailSend = new GmailSendAction(undefined as never, undefined as never);
    const gmailSearch = new GmailSearchAction(undefined as never, undefined as never);
    const driveCreate = new DriveCreateAction(undefined as never, undefined as never);
    const driveList = new DriveListAction(undefined as never, undefined as never);
    const sheetsAppend = new SheetsAppendAction(undefined as never, undefined as never);
    const sheetsRead = new SheetsReadAction(undefined as never, undefined as never);
    const docsCreate = new DocsCreateAction(undefined as never, undefined as never);
    const calendarCreate = new CalendarCreateAction(undefined as never, undefined as never);
    const outlookSend = new OutlookSendAction(undefined as never);
    const outlookSearch = new OutlookSearchAction(undefined as never);
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
    const twilioSendSms = new TwilioSendSmsAction(undefined as never);
    const twilioSendWhatsApp = new TwilioSendWhatsAppAction(undefined as never);
    const telegramSendMessage = new TelegramSendMessageAction(undefined as never);
    const slackMessageReceived = new SlackMessageReceivedPassthrough();
    const slackReactionAdded = new SlackReactionAddedPassthrough();
    const discordMessageReceived = new DiscordMessageReceivedPassthrough();
    const telegramMessageReceived = new TelegramMessageReceivedPassthrough();
    const twilioSmsReceived = new TwilioSmsReceivedPassthrough();
    const module = new EngineModule(
      registry,
      manualTrigger,
      cronTrigger,
      webhookTrigger,
      httpRequest,
      conditional,
      returnNode,
      iteratorNode,
      subworkflowAction,
      gmailSend,
      gmailSearch,
      driveCreate,
      driveList,
      sheetsAppend,
      sheetsRead,
      docsCreate,
      calendarCreate,
      outlookSend,
      outlookSearch,
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
      twilioSendSms,
      twilioSendWhatsApp,
      telegramSendMessage,
      slackMessageReceived,
      slackReactionAdded,
      discordMessageReceived,
      telegramMessageReceived,
      twilioSmsReceived,
    );
    return {
      registry,
      manualTrigger,
      cronTrigger,
      webhookTrigger,
      httpRequest,
      conditional,
      returnNode,
      iteratorNode,
      subworkflowAction,
      gmailSend,
      gmailSearch,
      driveCreate,
      driveList,
      sheetsAppend,
      sheetsRead,
      docsCreate,
      calendarCreate,
      outlookSend,
      outlookSearch,
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
      twilioSendSms,
      twilioSendWhatsApp,
      telegramSendMessage,
      slackMessageReceived,
      slackReactionAdded,
      discordMessageReceived,
      telegramMessageReceived,
      twilioSmsReceived,
      module,
    };
  };

  describe('onModuleInit', () => {
    it.each([
      ['ManualTrigger', 'manual-trigger', 'manualTrigger'],
      ['CronTrigger', 'cron-trigger', 'cronTrigger'],
      ['WebhookTrigger', 'webhook-trigger', 'webhookTrigger'],
      ['HttpRequestAction', 'http-request', 'httpRequest'],
      ['Conditional', 'conditional', 'conditional'],
      ['ReturnNode', 'return', 'returnNode'],
      ['IteratorNode', 'iterator', 'iteratorNode'],
      ['SubworkflowAction', 'subworkflow', 'subworkflowAction'],
      ['GmailSendAction', 'gmail-send', 'gmailSend'],
      ['GmailSearchAction', 'gmail-search', 'gmailSearch'],
      ['DriveCreateAction', 'drive-create', 'driveCreate'],
      ['DriveListAction', 'drive-list', 'driveList'],
      ['SheetsAppendAction', 'sheets-append', 'sheetsAppend'],
      ['SheetsReadAction', 'sheets-read', 'sheetsRead'],
      ['DocsCreateAction', 'docs-create', 'docsCreate'],
      ['CalendarCreateAction', 'calendar-create', 'calendarCreate'],
      ['OutlookSendAction', 'outlook-send', 'outlookSend'],
      ['OutlookSearchAction', 'outlook-search', 'outlookSearch'],
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
      // 5 communication push triggers (slack ×2, discord, telegram, twilio) = 15.
      expect(counts.trigger).toBe(15);
      expect(counts.logic).toBe(4);
      // 1 generic action (http-request) + 8 Google connector actions +
      // 5 Microsoft connector actions +
      // 7 communication actions (slack ×3, discord, twilio ×2, telegram) = 21.
      expect(counts.action).toBe(21);
    });
  });
});
