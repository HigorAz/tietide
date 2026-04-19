import type { ExecutionContext, NodeInput } from '@tietide/sdk';
import { ManualTrigger } from './manual-trigger';

const makeContext = (overrides: Partial<ExecutionContext> = {}): ExecutionContext => ({
  executionId: 'exec-1',
  workflowId: 'wf-1',
  nodeId: 'node-1',
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  getSecret: jest.fn(async () => 'secret-value'),
  ...overrides,
});

const makeInput = (data: Record<string, unknown> = {}): NodeInput => ({
  data,
  params: {},
});

describe('ManualTrigger', () => {
  let trigger: ManualTrigger;

  beforeEach(() => {
    trigger = new ManualTrigger();
  });

  describe('interface metadata', () => {
    it('should expose the manual-trigger type', () => {
      expect(trigger.type).toBe('manual-trigger');
    });

    it('should expose a human-readable name and description', () => {
      expect(trigger.name).toBe('Manual Trigger');
      expect(typeof trigger.description).toBe('string');
      expect(trigger.description.length).toBeGreaterThan(0);
    });

    it('should be categorized as a trigger', () => {
      expect(trigger.category).toBe('trigger');
    });
  });

  describe('execute', () => {
    it('should return the trigger data as output when input data is provided', async () => {
      const payload = { orderId: 'ord-42', amount: 99 };

      const result = await trigger.execute(makeInput(payload), makeContext());

      expect(result.data).toEqual(payload);
    });

    it('should return empty data when input data is empty', async () => {
      const result = await trigger.execute(makeInput({}), makeContext());

      expect(result.data).toEqual({});
    });

    it('should not mutate the input data object', async () => {
      const payload = { userId: 'u-1', nested: { flag: true } };
      const snapshot = structuredClone(payload);

      await trigger.execute(makeInput(payload), makeContext());

      expect(payload).toEqual(snapshot);
    });

    it('should preserve complex nested trigger data', async () => {
      const payload = {
        items: [
          { sku: 'A', qty: 2 },
          { sku: 'B', qty: 5 },
        ],
        meta: { source: 'ui', requestId: 'req-9' },
      };

      const result = await trigger.execute(makeInput(payload), makeContext());

      expect(result.data).toEqual(payload);
    });
  });
});
