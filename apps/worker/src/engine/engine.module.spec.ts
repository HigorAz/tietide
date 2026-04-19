import { HttpRequestAction } from '../nodes/actions/http-request';
import { NodeRegistry } from '../nodes/registry';
import { ManualTrigger } from '../nodes/triggers/manual-trigger';
import { EngineModule } from './engine.module';

describe('EngineModule', () => {
  const build = () => {
    const registry = new NodeRegistry();
    const manualTrigger = new ManualTrigger();
    const httpRequest = new HttpRequestAction();
    const module = new EngineModule(registry, manualTrigger, httpRequest);
    return { registry, manualTrigger, httpRequest, module };
  };

  describe('onModuleInit', () => {
    it('should register ManualTrigger in the NodeRegistry', () => {
      const { registry, manualTrigger, module } = build();

      module.onModuleInit();

      expect(registry.has('manual-trigger')).toBe(true);
      expect(registry.resolve('manual-trigger')).toBe(manualTrigger);
    });

    it('should register HttpRequestAction in the NodeRegistry', () => {
      const { registry, httpRequest, module } = build();

      module.onModuleInit();

      expect(registry.has('http-request')).toBe(true);
      expect(registry.resolve('http-request')).toBe(httpRequest);
    });

    it('should expose both the trigger and the action executors after init', () => {
      const { registry, module } = build();

      module.onModuleInit();

      const categories = registry
        .getAll()
        .map((e) => e.category)
        .sort();
      expect(categories).toEqual(['action', 'trigger']);
    });
  });
});
