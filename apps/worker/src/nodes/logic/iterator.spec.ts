import type { ExecutionContext } from '@tietide/sdk';
import { IteratorNode, ITERATOR_NODE_TYPE } from './iterator';

describe('IteratorNode', () => {
  it('should declare type "iterator" and category "logic"', () => {
    const node = new IteratorNode();
    expect(node.type).toBe(ITERATOR_NODE_TYPE);
    expect(node.type).toBe('iterator');
    expect(node.category).toBe('logic');
  });

  it('should expose a non-empty human-friendly name and description', () => {
    const node = new IteratorNode();
    expect(node.name.length).toBeGreaterThan(0);
    expect(node.description.length).toBeGreaterThan(0);
  });

  it('should throw a clear programmer-error when execute() is invoked directly', async () => {
    // The runner special-cases iterator and orchestrates iterations itself;
    // calling execute() bypasses that orchestration and indicates a wiring bug.
    const node = new IteratorNode();
    const ctx = {
      executionId: 'e',
      workflowId: 'w',
      nodeId: 'n',
      isDryRun: false,
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        debug: () => undefined,
      },
      getSecret: async () => '',
      getConnection: async () => {
        throw new Error('not implemented');
      },
      markConnectionForRefresh: async () => undefined,
    } satisfies ExecutionContext;

    await expect(node.execute(undefined, ctx)).rejects.toThrow(/should never be called/i);
  });
});
