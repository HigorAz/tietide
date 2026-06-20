import { PILL_SAMPLE_KEY, type WorkflowNode } from '@tietide/shared';
import type { NodeOutput } from '@tietide/sdk';
import { buildInput } from './runner-helpers';

const triggerNode = (config: Record<string, unknown>): WorkflowNode => ({
  id: 'T',
  type: 'github-issue-opened', // NodeCategory.TRIGGER in NODE_CATALOG
  name: 'Issue opened',
  position: { x: 0, y: 0 },
  config,
});

const actionNode = (config: Record<string, unknown>): WorkflowNode => ({
  id: 'A',
  type: 'http-request', // NodeCategory.ACTION
  name: 'HTTP',
  position: { x: 0, y: 0 },
  config,
});

describe('runner-helpers', () => {
  describe('buildInput', () => {
    const NO_INCOMING: never[] = [];
    const EMPTY_OUTPUTS = new Map<string, NodeOutput>();

    it('should emit a trigger root node’s __pillSample as input.data when no triggerData is supplied', () => {
      // A node-test/dry-run with no real webhook passes no triggerData. The
      // trigger must still expose its declared sample so downstream
      // {{trigger.*}} pills resolve instead of failing "Template path not found".
      const sample = { issue: { title: 'Hello', body: 'World' } };
      const input = buildInput(
        triggerNode({ [PILL_SAMPLE_KEY]: sample }),
        [],
        NO_INCOMING,
        EMPTY_OUTPUTS,
        undefined,
      );
      expect(input.data).toEqual(sample);
    });

    it('should prefer real triggerData over the trigger __pillSample when both exist', () => {
      const sample = { issue: { title: 'sample' } };
      const real = { issue: { title: 'real-webhook' } };
      const input = buildInput(
        triggerNode({ [PILL_SAMPLE_KEY]: sample }),
        [],
        NO_INCOMING,
        EMPTY_OUTPUTS,
        real,
      );
      expect(input.data).toEqual(real);
    });

    it('should fall back to {} for a trigger root node with neither triggerData nor a sample', () => {
      const input = buildInput(triggerNode({}), [], NO_INCOMING, EMPTY_OUTPUTS, undefined);
      expect(input.data).toEqual({});
    });

    it('should NOT use __pillSample for a non-trigger root node (a sample is its own output, not its input)', () => {
      const input = buildInput(
        actionNode({ [PILL_SAMPLE_KEY]: { ok: true } }),
        [],
        NO_INCOMING,
        EMPTY_OUTPUTS,
        undefined,
      );
      expect(input.data).toEqual({});
    });

    it('should ignore a non-object __pillSample on a trigger root node', () => {
      const input = buildInput(
        triggerNode({ [PILL_SAMPLE_KEY]: 'not-an-object' }),
        [],
        NO_INCOMING,
        EMPTY_OUTPUTS,
        undefined,
      );
      expect(input.data).toEqual({});
    });

    it('should never leak __pillSample into executor params', () => {
      const input = buildInput(
        triggerNode({ [PILL_SAMPLE_KEY]: { issue: { title: 'x' } } }),
        [],
        NO_INCOMING,
        EMPTY_OUTPUTS,
        undefined,
      );
      expect(input.params).not.toHaveProperty(PILL_SAMPLE_KEY);
    });
  });
});
