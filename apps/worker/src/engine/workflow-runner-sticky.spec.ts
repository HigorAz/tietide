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
  let events: RunnerHarness['events'];

  beforeEach(async () => {
    ({ runner, registry, prisma, events } = await buildRunnerHarness());
  });

  describe('sticky note nodes', () => {
    const sticky = (id: string, name = id) => ({
      id,
      type: 'sticky',
      name,
      position: { x: 0, y: 0 },
      config: { text: 'note', color: 'yellow', width: 220, height: 140 },
    });

    it('should succeed when a sticky has no executor registered', async () => {
      const trigger = makeExecutor(
        'manual-trigger',
        async () => ({ data: { ok: true } }),
        'trigger',
      );
      registry.register(trigger);

      const def: WorkflowDefinition = {
        nodes: [node('t1', 'manual-trigger'), sticky('s1', 'TODO: refactor')],
        edges: [],
      };

      const result = await runner.run({
        executionId: 'exec-sticky-1',
        workflowId: 'wf-1',
        definition: def,
      });

      expect(result.status).toBe('SUCCESS');
      expect(trigger.execute).toHaveBeenCalledTimes(1);
    });

    it('should not create an ExecutionStep for sticky nodes', async () => {
      registry.register(makeExecutor('manual-trigger', async () => ({ data: {} }), 'trigger'));

      const def: WorkflowDefinition = {
        nodes: [node('t1', 'manual-trigger'), sticky('s1'), sticky('s2')],
        edges: [],
      };

      await runner.run({
        executionId: 'exec-sticky-2',
        workflowId: 'wf-1',
        definition: def,
      });

      const createdNodeIds = prisma.executionStep.create.mock.calls.map(
        (c) => (c[0] as { data: { nodeId: string } }).data.nodeId,
      );
      expect(createdNodeIds).toEqual(['t1']);
      expect(createdNodeIds).not.toContain('s1');
      expect(createdNodeIds).not.toContain('s2');
    });

    it('should not publish step events for sticky nodes', async () => {
      registry.register(makeExecutor('manual-trigger', async () => ({ data: {} }), 'trigger'));

      const def: WorkflowDefinition = {
        nodes: [node('t1', 'manual-trigger'), sticky('s1')],
        edges: [],
      };

      await runner.run({
        executionId: 'exec-sticky-3',
        workflowId: 'wf-1',
        definition: def,
      });

      const startedNodeIds = events.publishStepStarted.mock.calls.map(
        (c) => (c[0] as { nodeId: string }).nodeId,
      );
      expect(startedNodeIds).toEqual(['t1']);
      const completedNodeIds = events.publishStepCompleted.mock.calls.map(
        (c) => (c[0] as { nodeId: string }).nodeId,
      );
      expect(completedNodeIds).not.toContain('s1');
    });

    it('should not break trigger reachability when sticky sorts first', async () => {
      const trigger = makeExecutor(
        'manual-trigger',
        async () => ({ data: { ok: true } }),
        'trigger',
      );
      const action = makeExecutor('http-request', async () => ({ data: {} }));
      registry.register(trigger);
      registry.register(action);

      // Sticky has no edges so it floats free; insertion order puts it first.
      // Without filtering, `reachable` would be seeded with the sticky id and
      // the real trigger would be marked unreachable.
      const def: WorkflowDefinition = {
        nodes: [sticky('s1'), node('t1', 'manual-trigger'), node('a1', 'http-request')],
        edges: [edge('e1', 't1', 'a1')],
      };

      const result = await runner.run({
        executionId: 'exec-sticky-4',
        workflowId: 'wf-1',
        definition: def,
      });

      expect(result.status).toBe('SUCCESS');
      expect(trigger.execute).toHaveBeenCalledTimes(1);
      expect(action.execute).toHaveBeenCalledTimes(1);
    });

    it('should ignore edges incident on a sticky for reachability', async () => {
      const trigger = makeExecutor(
        'manual-trigger',
        async () => ({ data: { ok: true } }),
        'trigger',
      );
      const action = makeExecutor('http-request', async () => ({ data: {} }));
      registry.register(trigger);
      registry.register(action);

      // A user could legally draw an edge to/from a sticky in the JSON.
      // Such edges must be invisible to execution: t1 -> a1 must still run.
      const def: WorkflowDefinition = {
        nodes: [node('t1', 'manual-trigger'), sticky('s1'), node('a1', 'http-request')],
        edges: [edge('e1', 't1', 's1'), edge('e2', 's1', 'a1'), edge('e3', 't1', 'a1')],
      };

      const result = await runner.run({
        executionId: 'exec-sticky-5',
        workflowId: 'wf-1',
        definition: def,
      });

      expect(result.status).toBe('SUCCESS');
      expect(action.execute).toHaveBeenCalledTimes(1);
    });
  });
});
