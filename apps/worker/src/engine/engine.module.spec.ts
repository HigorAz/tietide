import { HttpRequestAction } from '../nodes/actions/http-request';
import { Conditional } from '../nodes/logic/conditional';
import { NodeRegistry } from '../nodes/registry';
import { ManualTrigger } from '../nodes/triggers/manual-trigger';
import { CronTrigger } from '../nodes/triggers/cron-trigger';
import { EngineModule } from './engine.module';

describe('EngineModule', () => {
  const build = () => {
    const registry = new NodeRegistry();
    const manualTrigger = new ManualTrigger();
    const cronTrigger = new CronTrigger();
    const httpRequest = new HttpRequestAction();
    const conditional = new Conditional();
    const module = new EngineModule(registry, manualTrigger, cronTrigger, httpRequest, conditional);
    return { registry, manualTrigger, cronTrigger, httpRequest, conditional, module };
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

    it('should expose trigger, action, and logic executors after init', () => {
      const { registry, module } = build();

      module.onModuleInit();

      const categories = registry
        .getAll()
        .map((e) => e.category)
        .sort();
      expect(categories).toEqual(['action', 'logic', 'trigger', 'trigger']);
    });
  });
});
