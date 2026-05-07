import type { ExecutionContext, NodeInput } from '@tietide/sdk';
import { ReturnNode } from './return';

const makeContext = (): ExecutionContext => ({
  executionId: 'exec-1',
  workflowId: 'wf-1',
  nodeId: 'return-1',
  isDryRun: false,
  logger: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  },
  getSecret: async () => 'secret',
  getConnection: async () => {
    throw new Error('not implemented');
  },
  markConnectionForRefresh: async () => undefined,
});

describe('ReturnNode', () => {
  describe('execute', () => {
    it('should forward input.data as the value when no config.value is provided', async () => {
      const node = new ReturnNode();
      const input: NodeInput = {
        data: { foo: 'bar', n: 42 },
        params: {},
      };

      const out = await node.execute(input, makeContext());

      expect(out.data).toEqual({ value: { foo: 'bar', n: 42 } });
    });

    it('should use config.value (already template-resolved) when provided', async () => {
      const node = new ReturnNode();
      const input: NodeInput = {
        data: { ignored: true },
        params: { value: 'hello world' },
      };

      const out = await node.execute(input, makeContext());

      expect(out.data).toEqual({ value: 'hello world' });
    });

    it('should preserve non-string resolved values (e.g. objects from single-token data pills)', async () => {
      const node = new ReturnNode();
      const input: NodeInput = {
        data: {},
        params: { value: { nested: { id: 7 } } },
      };

      const out = await node.execute(input, makeContext());

      expect(out.data).toEqual({ value: { nested: { id: 7 } } });
    });

    it('should treat an empty-string config.value as a meaningful explicit value', async () => {
      // Empty string is a valid return value; only `undefined` triggers passthrough.
      const node = new ReturnNode();
      const input: NodeInput = {
        data: { upstream: 'data' },
        params: { value: '' },
      };

      const out = await node.execute(input, makeContext());

      expect(out.data).toEqual({ value: '' });
    });
  });
});
