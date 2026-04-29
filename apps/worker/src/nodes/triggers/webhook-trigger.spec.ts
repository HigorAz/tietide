import type { ExecutionContext, NodeInput } from '@tietide/sdk';
import { WebhookTrigger } from './webhook-trigger';

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

describe('WebhookTrigger', () => {
  let trigger: WebhookTrigger;

  beforeEach(() => {
    trigger = new WebhookTrigger();
  });

  describe('interface metadata', () => {
    it('should expose the webhook-trigger type', () => {
      expect(trigger.type).toBe('webhook-trigger');
    });

    it('should expose a human-readable name and description', () => {
      expect(trigger.name).toBe('Webhook Trigger');
      expect(typeof trigger.description).toBe('string');
      expect(trigger.description.length).toBeGreaterThan(0);
    });

    it('should be categorized as a trigger', () => {
      expect(trigger.category).toBe('trigger');
    });
  });

  describe('execute', () => {
    it('should return the inbound webhook payload as output', async () => {
      const payload = { event: 'push', repository: 'tietide', ref: 'refs/heads/main' };

      const result = await trigger.execute(makeInput(payload), makeContext());

      expect(result.data).toEqual(payload);
    });

    it('should return empty data when no payload is provided', async () => {
      const result = await trigger.execute(makeInput({}), makeContext());

      expect(result.data).toEqual({});
    });

    it('should not mutate the inbound payload', async () => {
      const payload = { event: 'pull_request', nested: { number: 42 } };
      const snapshot = structuredClone(payload);

      await trigger.execute(makeInput(payload), makeContext());

      expect(payload).toEqual(snapshot);
    });
  });
});
