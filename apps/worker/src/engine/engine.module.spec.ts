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
      module,
    };
  };

  describe('onModuleInit', () => {
    it('should register ManualTrigger in the NodeRegistry', () => {
      const { registry, manualTrigger, module } = build();

      module.onModuleInit();

      expect(registry.has('manual-trigger')).toBe(true);
      expect(registry.resolve('manual-trigger')).toBe(manualTrigger);
    });

    it('should register CronTrigger in the NodeRegistry', () => {
      const { registry, cronTrigger, module } = build();

      module.onModuleInit();

      expect(registry.has('cron-trigger')).toBe(true);
      expect(registry.resolve('cron-trigger')).toBe(cronTrigger);
    });

    it('should register WebhookTrigger in the NodeRegistry', () => {
      const { registry, webhookTrigger, module } = build();

      module.onModuleInit();

      expect(registry.has('webhook-trigger')).toBe(true);
      expect(registry.resolve('webhook-trigger')).toBe(webhookTrigger);
    });

    it('should register HttpRequestAction in the NodeRegistry', () => {
      const { registry, httpRequest, module } = build();

      module.onModuleInit();

      expect(registry.has('http-request')).toBe(true);
      expect(registry.resolve('http-request')).toBe(httpRequest);
    });

    it('should register Conditional in the NodeRegistry', () => {
      const { registry, conditional, module } = build();

      module.onModuleInit();

      expect(registry.has('conditional')).toBe(true);
      expect(registry.resolve('conditional')).toBe(conditional);
    });

    it('should register ReturnNode in the NodeRegistry', () => {
      const { registry, returnNode, module } = build();

      module.onModuleInit();

      expect(registry.has('return')).toBe(true);
      expect(registry.resolve('return')).toBe(returnNode);
    });

    it('should register IteratorNode in the NodeRegistry', () => {
      const { registry, iteratorNode, module } = build();

      module.onModuleInit();

      expect(registry.has('iterator')).toBe(true);
      expect(registry.resolve('iterator')).toBe(iteratorNode);
    });

    it('should register SubworkflowAction in the NodeRegistry', () => {
      const { registry, subworkflowAction, module } = build();

      module.onModuleInit();

      expect(registry.has('subworkflow')).toBe(true);
      expect(registry.resolve('subworkflow')).toBe(subworkflowAction);
    });

    it('should register GmailSendAction in the NodeRegistry', () => {
      const { registry, gmailSend, module } = build();

      module.onModuleInit();

      expect(registry.has('gmail-send')).toBe(true);
      expect(registry.resolve('gmail-send')).toBe(gmailSend);
    });

    it('should register GmailSearchAction in the NodeRegistry', () => {
      const { registry, gmailSearch, module } = build();

      module.onModuleInit();

      expect(registry.has('gmail-search')).toBe(true);
      expect(registry.resolve('gmail-search')).toBe(gmailSearch);
    });

    it('should expose triggers, actions, and logic executors after init', () => {
      const { registry, module } = build();

      module.onModuleInit();

      const counts = registry.getAll().reduce<Record<string, number>>((acc, e) => {
        acc[e.category] = (acc[e.category] ?? 0) + 1;
        return acc;
      }, {});
      expect(counts.trigger).toBe(3);
      expect(counts.logic).toBe(4);
      // 1 generic action (http-request) + the registered Google connector actions.
      expect(counts.action).toBeGreaterThanOrEqual(2);
    });
  });
});
