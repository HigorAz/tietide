import type { ExecutionContext, NodeInput } from '@tietide/sdk';
import { Conditional } from './conditional';

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
  params: Record<string, unknown>,
  data: Record<string, unknown> = {},
): NodeInput => ({
  data,
  params,
});

describe('Conditional', () => {
  describe('interface metadata', () => {
    let node: Conditional;

    beforeEach(() => {
      node = new Conditional();
    });

    it('should expose the conditional type', () => {
      expect(node.type).toBe('conditional');
    });

    it('should be in the logic category', () => {
      expect(node.category).toBe('logic');
    });

    it('should have a non-empty name and description', () => {
      expect(node.name.length).toBeGreaterThan(0);
      expect(node.description.length).toBeGreaterThan(0);
    });
  });

  describe('execute', () => {
    let node: Conditional;

    beforeEach(() => {
      node = new Conditional();
    });

    it('should route to the true branch when a simple equality holds', async () => {
      const result = await node.execute(
        makeInput({ condition: '{{statusCode}} === 200' }, { statusCode: 200 }),
        makeContext(),
      );

      expect(result.metadata?.branch).toBe('true');
      expect(result.data.branch).toBe(true);
      expect(result.data.evaluatedCondition).toBe('200 === 200');
    });

    it('should route to the false branch when the condition is not satisfied', async () => {
      const result = await node.execute(
        makeInput({ condition: '{{statusCode}} === 200' }, { statusCode: 500 }),
        makeContext(),
      );

      expect(result.metadata?.branch).toBe('false');
      expect(result.data.branch).toBe(false);
      expect(result.data.evaluatedCondition).toBe('500 === 200');
    });

    it('should resolve nested template paths against previous node output', async () => {
      const result = await node.execute(
        makeInput({ condition: '{{response.status}} === "ok"' }, { response: { status: 'ok' } }),
        makeContext(),
      );

      expect(result.metadata?.branch).toBe('true');
      expect(result.data.branch).toBe(true);
      expect(result.data.evaluatedCondition).toBe('"ok" === "ok"');
    });

    it('should support relational operators against numeric data', async () => {
      const result = await node.execute(
        makeInput({ condition: '{{count}} > 10' }, { count: 42 }),
        makeContext(),
      );

      expect(result.metadata?.branch).toBe('true');
      expect(result.data.branch).toBe(true);
    });

    it('should throw a clear error for an unparseable condition expression', async () => {
      await expect(
        node.execute(makeInput({ condition: 'not valid' }), makeContext()),
      ).rejects.toThrow(/invalid condition/i);
    });

    it('should reject an empty condition via Zod validation', async () => {
      await expect(node.execute(makeInput({ condition: '' }), makeContext())).rejects.toThrow();
    });

    it('should reject when the condition param is missing', async () => {
      await expect(node.execute(makeInput({}), makeContext())).rejects.toThrow();
    });
  });
});
