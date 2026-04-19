import { NodeRegistry } from '../nodes/registry';
import { ManualTrigger } from '../nodes/triggers/manual-trigger';
import { EngineModule } from './engine.module';

describe('EngineModule', () => {
  describe('onModuleInit', () => {
    it('should register ManualTrigger in the NodeRegistry', () => {
      const registry = new NodeRegistry();
      const manualTrigger = new ManualTrigger();
      const module = new EngineModule(registry, manualTrigger);

      module.onModuleInit();

      expect(registry.has('manual-trigger')).toBe(true);
      expect(registry.resolve('manual-trigger')).toBe(manualTrigger);
    });

    it('should expose the registered trigger as a trigger category executor', () => {
      const registry = new NodeRegistry();
      const manualTrigger = new ManualTrigger();
      const module = new EngineModule(registry, manualTrigger);

      module.onModuleInit();

      const all = registry.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].category).toBe('trigger');
    });
  });
});
