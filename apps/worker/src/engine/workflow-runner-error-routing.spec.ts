import {
  buildRunnerHarness,
  makeExecutor,
  node,
  edge,
  errorEdge,
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

  describe('error-edge routing', () => {
    it('should still abort the workflow when a failing node has no error edge', async () => {
      registry.register(makeExecutor('trigger', async () => ({ data: {} }), 'trigger'));
      registry.register(
        makeExecutor('a', async () => {
          throw new Error('boom');
        }),
      );

      const def: WorkflowDefinition = {
        nodes: [node('T', 'trigger'), node('A', 'a')],
        edges: [edge('e1', 'T', 'A')],
      };

      const result = await runner.run({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: def,
      });

      expect(result.status).toBe('FAILED');
      expect(result.failedNodeId).toBe('A');
    });

    it('should route to the error edge target with { error: { message, nodeId } } as input.data', async () => {
      registry.register(makeExecutor('trigger', async () => ({ data: {} }), 'trigger'));
      registry.register(
        makeExecutor('a', async () => {
          throw new Error('boom');
        }),
      );
      const handler = makeExecutor('handler');
      registry.register(handler);

      const def: WorkflowDefinition = {
        nodes: [node('T', 'trigger'), node('A', 'a'), node('H', 'handler')],
        edges: [edge('e1', 'T', 'A'), errorEdge('e2', 'A', 'H')],
      };

      const result = await runner.run({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: def,
      });

      expect(result.status).toBe('SUCCESS');
      expect(handler.execute).toHaveBeenCalledTimes(1);
      const handlerInput = handler.execute.mock.calls[0][0];
      expect(handlerInput.data).toEqual({
        error: { message: 'boom', nodeId: 'A' },
      });
    });

    it('should record the failed node as FAILED and the error-handler as SUCCESS', async () => {
      registry.register(makeExecutor('trigger', async () => ({ data: {} }), 'trigger'));
      registry.register(
        makeExecutor('a', async () => {
          throw new Error('boom');
        }),
      );
      registry.register(makeExecutor('handler'));

      const def: WorkflowDefinition = {
        nodes: [node('T', 'trigger'), node('A', 'a'), node('H', 'handler')],
        edges: [edge('e1', 'T', 'A'), errorEdge('e2', 'A', 'H')],
      };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      const updates = prisma.executionStep.update.mock.calls.map((c) => c[0].data);
      const statusByNode = new Map<string, string>();
      const inputByNode = new Map<string, unknown>();
      for (const u of updates) {
        statusByNode.set(u.nodeId as string, u.status as string);
        inputByNode.set(u.nodeId as string, u.inputData);
      }
      expect(statusByNode.get('A')).toBe('FAILED');
      expect(statusByNode.get('H')).toBe('SUCCESS');
      expect(inputByNode.get('H')).toEqual({
        error: { message: 'boom', nodeId: 'A' },
      });
    });

    it('should still emit step.failed event for the failed node when an error edge exists', async () => {
      registry.register(makeExecutor('trigger', async () => ({ data: {} }), 'trigger'));
      registry.register(
        makeExecutor('a', async () => {
          throw new Error('boom');
        }),
      );
      registry.register(makeExecutor('handler'));

      const def: WorkflowDefinition = {
        nodes: [node('T', 'trigger'), node('A', 'a'), node('H', 'handler')],
        edges: [edge('e1', 'T', 'A'), errorEdge('e2', 'A', 'H')],
      };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      expect(events.publishStepFailed).toHaveBeenCalledTimes(1);
      const failedArgs = events.publishStepFailed.mock.calls[0][0];
      expect(failedArgs.nodeId).toBe('A');
      expect(failedArgs.error.message).toBe('boom');
    });

    it('should fail the workflow when the error-handler itself throws', async () => {
      registry.register(makeExecutor('trigger', async () => ({ data: {} }), 'trigger'));
      registry.register(
        makeExecutor('a', async () => {
          throw new Error('first');
        }),
      );
      registry.register(
        makeExecutor('handler', async () => {
          throw new Error('second');
        }),
      );

      const def: WorkflowDefinition = {
        nodes: [node('T', 'trigger'), node('A', 'a'), node('H', 'handler')],
        edges: [edge('e1', 'T', 'A'), errorEdge('e2', 'A', 'H')],
      };

      const result = await runner.run({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: def,
      });

      expect(result.status).toBe('FAILED');
      expect(result.failedNodeId).toBe('H');
      expect(result.error).toContain('second');
    });

    it('should cancel the success-edge target and run only the error-handler when the source fails', async () => {
      registry.register(makeExecutor('trigger', async () => ({ data: {} }), 'trigger'));
      registry.register(
        makeExecutor('a', async () => {
          throw new Error('boom');
        }),
      );
      const successPath = makeExecutor('successPath');
      const handler = makeExecutor('handler');
      registry.register(successPath);
      registry.register(handler);

      const def: WorkflowDefinition = {
        nodes: [
          node('T', 'trigger'),
          node('A', 'a'),
          node('S', 'successPath'),
          node('H', 'handler'),
        ],
        edges: [edge('e1', 'T', 'A'), edge('e2', 'A', 'S'), errorEdge('e3', 'A', 'H')],
      };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      expect(successPath.execute).not.toHaveBeenCalled();
      expect(handler.execute).toHaveBeenCalledTimes(1);

      const writes = [
        ...prisma.executionStep.create.mock.calls,
        ...prisma.executionStep.update.mock.calls,
      ].map((c) => c[0].data);
      const statusByNode = new Map<string, string>();
      for (const w of writes) statusByNode.set(w.nodeId as string, w.status as string);
      expect(statusByNode.get('S')).toBe('CANCELLED');
      expect(statusByNode.get('H')).toBe('SUCCESS');
    });

    it('should follow only success edges (and cancel error-edge targets) when the source succeeds', async () => {
      registry.register(makeExecutor('trigger', async () => ({ data: {} }), 'trigger'));
      registry.register(makeExecutor('a', async () => ({ data: { ok: true } })));
      const successPath = makeExecutor('successPath');
      const handler = makeExecutor('handler');
      registry.register(successPath);
      registry.register(handler);

      const def: WorkflowDefinition = {
        nodes: [
          node('T', 'trigger'),
          node('A', 'a'),
          node('S', 'successPath'),
          node('H', 'handler'),
        ],
        edges: [edge('e1', 'T', 'A'), edge('e2', 'A', 'S'), errorEdge('e3', 'A', 'H')],
      };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      expect(successPath.execute).toHaveBeenCalledTimes(1);
      expect(handler.execute).not.toHaveBeenCalled();

      const writes = [
        ...prisma.executionStep.create.mock.calls,
        ...prisma.executionStep.update.mock.calls,
      ].map((c) => c[0].data);
      const statusByNode = new Map<string, string>();
      for (const w of writes) statusByNode.set(w.nodeId as string, w.status as string);
      expect(statusByNode.get('S')).toBe('SUCCESS');
      expect(statusByNode.get('H')).toBe('CANCELLED');
    });

    it('should pass through err.code on the error payload when present', async () => {
      registry.register(makeExecutor('trigger', async () => ({ data: {} }), 'trigger'));
      registry.register(
        makeExecutor('a', async () => {
          const err = new Error('timed out') as Error & { code: string };
          err.code = 'ETIMEDOUT';
          throw err;
        }),
      );
      const handler = makeExecutor('handler');
      registry.register(handler);

      const def: WorkflowDefinition = {
        nodes: [node('T', 'trigger'), node('A', 'a'), node('H', 'handler')],
        edges: [edge('e1', 'T', 'A'), errorEdge('e2', 'A', 'H')],
      };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      const handlerInput = handler.execute.mock.calls[0][0];
      expect(handlerInput.data).toEqual({
        error: { message: 'timed out', code: 'ETIMEDOUT', nodeId: 'A' },
      });
    });

    it('should run a webhook → http(fails) -error-> slack workflow end-to-end', async () => {
      registry.register(
        makeExecutor(
          'webhook-trigger',
          async () => ({ data: { event: 'order.created' } }),
          'trigger',
        ),
      );
      registry.register(
        makeExecutor('http-request', async () => {
          throw new Error('503 Service Unavailable');
        }),
      );
      const slack = makeExecutor('slack-notify');
      registry.register(slack);

      const def: WorkflowDefinition = {
        nodes: [
          node('wh', 'webhook-trigger'),
          node('http', 'http-request'),
          node('slack', 'slack-notify'),
        ],
        edges: [edge('e1', 'wh', 'http'), errorEdge('e2', 'http', 'slack')],
      };

      const result = await runner.run({
        executionId: 'exec-int-1',
        workflowId: 'wf-1',
        definition: def,
      });

      expect(result.status).toBe('SUCCESS');
      expect(slack.execute).toHaveBeenCalledTimes(1);
      const slackInput = slack.execute.mock.calls[0][0];
      expect(slackInput.data).toEqual({
        error: { message: '503 Service Unavailable', nodeId: 'http' },
      });
    });
  });
});
