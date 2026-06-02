import {
  buildRunnerHarness,
  makeExecutor,
  node,
  edge,
  type RunnerHarness,
} from './__test__/fixtures';
import type { WorkflowDefinition } from '@tietide/shared';

describe('WorkflowRunner', () => {
  let runner: RunnerHarness['runner'];
  let registry: RunnerHarness['registry'];

  beforeEach(async () => {
    ({ runner, registry } = await buildRunnerHarness());
  });

  describe('upstream scope ($nodes)', () => {
    it('should populate input.scope with the full upstream { [nodeId]: data } map (Issue #260)', async () => {
      registry.register(makeExecutor('trigger', async () => ({ data: { t: true } }), 'trigger'));
      registry.register(makeExecutor('leftBranch', async () => ({ data: { from: 'A', n: 1 } })));
      registry.register(makeExecutor('rightBranch', async () => ({ data: { from: 'B', n: 2 } })));
      const merge = makeExecutor('merge');
      registry.register(merge);

      const def: WorkflowDefinition = {
        nodes: [
          node('T', 'trigger'),
          node('A', 'leftBranch'),
          node('B', 'rightBranch'),
          node('M', 'merge'),
        ],
        edges: [
          edge('e1', 'T', 'A'),
          edge('e2', 'T', 'B'),
          edge('e3', 'A', 'M'),
          edge('e4', 'B', 'M'),
        ],
      };

      await runner.run({ executionId: 'exec-scope', workflowId: 'wf-1', definition: def });

      expect(merge.execute).toHaveBeenCalledTimes(1);
      const mergeInput = merge.execute.mock.calls[0][0];
      // scope exposes EVERY already-executed node's output keyed by id — even
      // though `data` (flattened last-predecessor) only carries one branch.
      expect(mergeInput.scope).toEqual(
        expect.objectContaining({
          T: { t: true },
          A: { from: 'A', n: 1 },
          B: { from: 'B', n: 2 },
        }),
      );
      expect(['A', 'B']).toContain((mergeInput.data as { from?: string }).from);
    });

    it('should leave input.scope empty for a root node with no predecessors', async () => {
      const root = makeExecutor('manual-trigger', async () => ({ data: {} }), 'trigger');
      registry.register(root);

      const def: WorkflowDefinition = { nodes: [node('T', 'manual-trigger')], edges: [] };

      await runner.run({ executionId: 'exec-scope-root', workflowId: 'wf-1', definition: def });

      const rootInput = root.execute.mock.calls[0][0];
      expect(rootInput.scope).toEqual({});
    });
  });
});
