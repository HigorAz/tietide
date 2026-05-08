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
import {
  StripeEventReceivedPassthrough,
  DriveFileAddedPassthrough,
} from '../nodes/triggers/push/passthrough-push.executor';
import { GmailMessageReceivedExecutor } from '../nodes/triggers/push/gmail-message-received.executor';
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
      expect(counts.trigger).toBe(6);
      expect(counts.logic).toBe(4);
      // 1 generic action (http-request) + 8 Google connector actions
      // + 5 Microsoft connector actions = 14.
      expect(counts.action).toBe(14);
    });
  });
});
