import type { ExecutionContext, NodeInput } from '@tietide/sdk';
import { CronTrigger } from './cron-trigger';

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

const makeInput = (
  data: Record<string, unknown> = {},
  params: Record<string, unknown> = {},
): NodeInput => ({ data, params });

describe('CronTrigger', () => {
  let trigger: CronTrigger;

  beforeEach(() => {
    trigger = new CronTrigger();
  });

  describe('interface metadata', () => {
    it('should expose the cron-trigger type', () => {
      expect(trigger.type).toBe('cron-trigger');
    });

    it('should be categorized as a trigger', () => {
      expect(trigger.category).toBe('trigger');
    });

    it('should expose a human-readable name and description', () => {
      expect(trigger.name).toBe('Cron Trigger');
      expect(typeof trigger.description).toBe('string');
      expect(trigger.description.length).toBeGreaterThan(0);
    });
  });

  describe('execute', () => {
    it('should return the trigger data as output', async () => {
      const result = await trigger.execute(
        makeInput({ scheduledFor: '2026-04-25T12:00:00Z' }, { expression: '*/5 * * * *' }),
        makeContext(),
      );

      expect(result.data).toEqual(
        expect.objectContaining({ scheduledFor: '2026-04-25T12:00:00Z' }),
      );
    });

    it('should not mutate the input data object', async () => {
      const data = { scheduledFor: '2026-04-25T12:00:00Z' };
      const snapshot = structuredClone(data);

      await trigger.execute(makeInput(data, { expression: '*/5 * * * *' }), makeContext());

      expect(data).toEqual(snapshot);
    });

    it('should return empty data when no trigger data is provided', async () => {
      const result = await trigger.execute(
        makeInput({}, { expression: '*/5 * * * *' }),
        makeContext(),
      );

      expect(result.data).toEqual({});
    });
  });
});
