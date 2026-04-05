import { NodeRegistry } from './registry';
import type { INodeExecutor, NodeInput, NodeOutput, ExecutionContext } from '@tietide/sdk';

class StubExecutor implements INodeExecutor {
  readonly type = 'test-node';
  readonly name = 'Test Node';
  readonly description = 'A test node';
  readonly category = 'action' as const;

  async execute(_input: NodeInput, _context: ExecutionContext): Promise<NodeOutput> {
    return { data: {} };
  }
}

describe('NodeRegistry', () => {
  let registry: NodeRegistry;

  beforeEach(() => {
    registry = new NodeRegistry();
  });

  it('should register and resolve a node executor', () => {
    const executor = new StubExecutor();
    registry.register(executor);

    expect(registry.resolve('test-node')).toBe(executor);
  });

  it('should return undefined for unregistered node type', () => {
    expect(registry.resolve('unknown')).toBeUndefined();
  });

  it('should report whether a node type is registered', () => {
    const executor = new StubExecutor();
    registry.register(executor);

    expect(registry.has('test-node')).toBe(true);
    expect(registry.has('unknown')).toBe(false);
  });

  it('should return all registered executors', () => {
    const executor = new StubExecutor();
    registry.register(executor);

    const all = registry.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]).toBe(executor);
  });
});
