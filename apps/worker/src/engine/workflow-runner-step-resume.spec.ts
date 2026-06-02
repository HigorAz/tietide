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
  let prisma: RunnerHarness['prisma'];

  beforeEach(async () => {
    ({ runner, registry, prisma } = await buildRunnerHarness());
  });

  // Step-level resume: a BullMQ retry re-processes the SAME executionId. The
  // runner must reuse the recorded output of side-effecting ACTION nodes that
  // already succeeded (so the retry does not re-fire them) while re-running pure
  // logic/trigger nodes and the node that actually failed (W1.8).
  describe('step-level resume (W1.8)', () => {
    it('reuses a prior SUCCESS action node output instead of re-executing it', async () => {
      const a = makeExecutor('a', async () => ({ data: { value: 'FRESH' } }), 'action');
      const b = makeExecutor('b', async () => ({ data: { ok: true } }), 'action');
      registry.register(a);
      registry.register(b);

      // A already succeeded on the prior attempt with a recorded output.
      prisma.executionStep.findMany.mockResolvedValue([
        { id: 'step-A', nodeId: 'A', status: 'SUCCESS', outputData: { value: 'REUSED' } },
      ]);

      const def: WorkflowDefinition = {
        nodes: [node('A', 'a'), node('B', 'b')],
        edges: [edge('e1', 'A', 'B')],
      };

      const result = await runner.run({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: def,
      });

      expect(result.status).toBe('SUCCESS');
      // A is NOT re-executed (no duplicate side effect)...
      expect(a.execute).not.toHaveBeenCalled();
      // ...and B receives A's RECORDED output as its input, not a fresh run.
      expect(b.execute).toHaveBeenCalledTimes(1);
      expect(b.execute.mock.calls[0][0].data).toEqual({ value: 'REUSED' });
    });

    it('re-runs a prior SUCCESS logic node so conditional branch routing is reproduced', async () => {
      // metadata.branch is not persisted, so logic nodes must always re-run.
      const cond = makeExecutor(
        'conditional',
        async () => ({ data: { branch: true }, metadata: { branch: 'true' } }),
        'logic',
      );
      registry.register(cond);

      prisma.executionStep.findMany.mockResolvedValue([
        { id: 'step-C', nodeId: 'C', status: 'SUCCESS', outputData: { branch: true } },
      ]);

      const def: WorkflowDefinition = { nodes: [node('C', 'conditional')], edges: [] };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      expect(cond.execute).toHaveBeenCalledTimes(1);
    });

    it('drops the non-reused prior steps before re-running', async () => {
      const a = makeExecutor('a', async () => ({ data: {} }), 'action');
      const b = makeExecutor('b', async () => ({ data: {} }), 'action');
      registry.register(a);
      registry.register(b);

      prisma.executionStep.findMany.mockResolvedValue([
        { id: 'step-A', nodeId: 'A', status: 'SUCCESS', outputData: { kept: true } },
        { id: 'step-B', nodeId: 'B', status: 'FAILED', outputData: null },
      ]);

      const def: WorkflowDefinition = {
        nodes: [node('A', 'a'), node('B', 'b')],
        edges: [edge('e1', 'A', 'B')],
      };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      // Keeps A's reusable SUCCESS step, deletes everything else for the execution.
      expect(prisma.executionStep.deleteMany).toHaveBeenCalledWith({
        where: { executionId: 'exec-1', id: { notIn: ['step-A'] } },
      });
    });

    it('does not reuse or delete anything on a first attempt (no prior steps)', async () => {
      const a = makeExecutor('a', async () => ({ data: {} }), 'action');
      registry.register(a);
      prisma.executionStep.findMany.mockResolvedValue([]);

      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      expect(a.execute).toHaveBeenCalledTimes(1);
      expect(prisma.executionStep.deleteMany).not.toHaveBeenCalled();
    });
  });
});
