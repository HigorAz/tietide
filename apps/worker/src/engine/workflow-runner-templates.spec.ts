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
  let envVarResolver: RunnerHarness['envVarResolver'];

  beforeEach(async () => {
    ({ runner, registry, prisma, envVarResolver } = await buildRunnerHarness());
  });

  describe('template resolution', () => {
    it('should resolve {{nodeId.path}} tokens in node config before invoking the executor', async () => {
      const trigger = makeExecutor(
        'webhook-trigger',
        async () => ({ data: { email: 'alice@example.com', age: 30 } }),
        'trigger',
      );
      const action = makeExecutor('http-request');
      registry.register(trigger);
      registry.register(action);

      const httpNode = {
        ...node('http', 'http-request'),
        config: {
          url: 'https://api.example.com/users/{{wh.email}}',
          headers: { 'X-Age': 'age={{wh.age}}' },
        },
      };

      const def: WorkflowDefinition = {
        nodes: [node('wh', 'webhook-trigger'), httpNode],
        edges: [edge('e1', 'wh', 'http')],
      };

      const result = await runner.run({
        executionId: 'exec-tpl-1',
        workflowId: 'wf-1',
        definition: def,
        triggerData: {},
      });

      expect(result.status).toBe('SUCCESS');
      expect(action.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          params: {
            url: 'https://api.example.com/users/alice@example.com',
            headers: { 'X-Age': 'age=30' },
          },
        }),
        expect.any(Object),
      );
    });

    it('should preserve resolved value type when the entire string is one token', async () => {
      const trigger = makeExecutor(
        'webhook-trigger',
        async () => ({ data: { count: 42, payload: { ok: true } } }),
        'trigger',
      );
      const action = makeExecutor('http-request');
      registry.register(trigger);
      registry.register(action);

      const httpNode = {
        ...node('http', 'http-request'),
        config: { count: '{{wh.count}}', body: '{{wh.payload}}' },
      };

      const def: WorkflowDefinition = {
        nodes: [node('wh', 'webhook-trigger'), httpNode],
        edges: [edge('e1', 'wh', 'http')],
      };

      await runner.run({ executionId: 'exec-tpl-2', workflowId: 'wf-1', definition: def });

      expect(action.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { count: 42, body: { ok: true } },
        }),
        expect.any(Object),
      );
    });

    it('should fail the step with TemplatePathNotFoundError message when a path is missing', async () => {
      const trigger = makeExecutor(
        'webhook-trigger',
        async () => ({ data: { email: 'alice@example.com' } }),
        'trigger',
      );
      const action = makeExecutor('http-request');
      registry.register(trigger);
      registry.register(action);

      const httpNode = {
        ...node('http', 'http-request'),
        config: { url: 'https://api.example.com/{{wh.missing}}' },
      };

      const def: WorkflowDefinition = {
        nodes: [node('wh', 'webhook-trigger'), httpNode],
        edges: [edge('e1', 'wh', 'http')],
      };

      const result = await runner.run({
        executionId: 'exec-tpl-3',
        workflowId: 'wf-1',
        definition: def,
      });

      expect(result.status).toBe('FAILED');
      expect(result.failedNodeId).toBe('http');
      expect(result.error).toMatch(/Template path not found.*wh\.missing/);
      expect(action.execute).not.toHaveBeenCalled();
      expect(prisma.executionStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nodeId: 'http',
            status: 'FAILED',
            error: expect.stringContaining('wh.missing'),
          }),
        }),
      );
    });

    it('should substitute UPPER_SNAKE tokens from envScope when defined', async () => {
      envVarResolver.getEnvScope.mockResolvedValue(
        new Map<string, string>([['API_KEY', 'sk-live-xyz']]),
      );
      const trigger = makeExecutor('webhook-trigger', async () => ({ data: {} }), 'trigger');
      const action = makeExecutor('http-request');
      registry.register(trigger);
      registry.register(action);

      const httpNode = {
        ...node('http', 'http-request'),
        config: { url: 'Bearer {{API_KEY}}' },
      };
      const def: WorkflowDefinition = {
        nodes: [node('wh', 'webhook-trigger'), httpNode],
        edges: [edge('e1', 'wh', 'http')],
      };

      const result = await runner.run({
        executionId: 'exec-env-ok',
        workflowId: 'wf-1',
        definition: def,
      });

      expect(result.status).toBe('SUCCESS');
      expect(action.execute).toHaveBeenCalledWith(
        expect.objectContaining({ params: { url: 'Bearer sk-live-xyz' } }),
        expect.any(Object),
      );
    });

    it('should fail the step with the issue-specified message when an env var is missing', async () => {
      envVarResolver.getEnvScope.mockResolvedValue(new Map<string, string>());
      const trigger = makeExecutor('webhook-trigger', async () => ({ data: {} }), 'trigger');
      const action = makeExecutor('http-request');
      registry.register(trigger);
      registry.register(action);

      const httpNode = {
        ...node('http', 'http-request'),
        config: { url: '{{SLACK_WEBHOOK_URL}}' },
      };
      const def: WorkflowDefinition = {
        nodes: [node('wh', 'webhook-trigger'), httpNode],
        edges: [edge('e1', 'wh', 'http')],
      };

      const result = await runner.run({
        executionId: 'exec-env-missing',
        workflowId: 'wf-1',
        definition: def,
      });

      expect(result.status).toBe('FAILED');
      expect(result.failedNodeId).toBe('http');
      expect(result.error).toBe('Env var SLACK_WEBHOOK_URL not found in user or global scope');
      expect(action.execute).not.toHaveBeenCalled();
      expect(prisma.executionStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nodeId: 'http',
            status: 'FAILED',
            error: 'Env var SLACK_WEBHOOK_URL not found in user or global scope',
          }),
        }),
      );
    });

    it('should fetch the envScope exactly once per execution (regardless of node count)', async () => {
      envVarResolver.getEnvScope.mockResolvedValue(
        new Map<string, string>([['BASE_URL', 'https://api']]),
      );
      const a = makeExecutor('a');
      const b = makeExecutor('b');
      const c = makeExecutor('c');
      registry.register(a);
      registry.register(b);
      registry.register(c);

      const def: WorkflowDefinition = {
        nodes: [
          { ...node('A', 'a'), config: { url: '{{BASE_URL}}/a' } },
          { ...node('B', 'b'), config: { url: '{{BASE_URL}}/b' } },
          { ...node('C', 'c'), config: { url: '{{BASE_URL}}/c' } },
        ],
        edges: [edge('e1', 'A', 'B'), edge('e2', 'B', 'C')],
      };

      await runner.run({ executionId: 'exec-cache', workflowId: 'wf-1', definition: def });

      expect(envVarResolver.getEnvScope).toHaveBeenCalledTimes(1);
      expect(envVarResolver.getEnvScope).toHaveBeenCalledWith('exec-cache');
    });

    it('should release the envScope cache when the execution finishes', async () => {
      envVarResolver.getEnvScope.mockResolvedValue(new Map());
      const trigger = makeExecutor('webhook-trigger', async () => ({ data: {} }), 'trigger');
      registry.register(trigger);

      const def: WorkflowDefinition = {
        nodes: [node('wh', 'webhook-trigger')],
        edges: [],
      };

      await runner.run({ executionId: 'exec-release', workflowId: 'wf-1', definition: def });

      expect(envVarResolver.releaseExecution).toHaveBeenCalledWith('exec-release');
    });

    it('should release the envScope cache even when a node fails', async () => {
      envVarResolver.getEnvScope.mockResolvedValue(new Map());
      const trigger = makeExecutor('webhook-trigger', async () => ({ data: {} }), 'trigger');
      const failing = makeExecutor('failing', async () => {
        throw new Error('boom');
      });
      registry.register(trigger);
      registry.register(failing);

      const def: WorkflowDefinition = {
        nodes: [node('wh', 'webhook-trigger'), node('F', 'failing')],
        edges: [edge('e1', 'wh', 'F')],
      };

      await runner.run({ executionId: 'exec-fail', workflowId: 'wf-1', definition: def });

      expect(envVarResolver.releaseExecution).toHaveBeenCalledWith('exec-fail');
    });

    it('should resolve env tokens AND data tokens in the same node config', async () => {
      envVarResolver.getEnvScope.mockResolvedValue(
        new Map<string, string>([['BASE_URL', 'https://api.example.com']]),
      );
      const trigger = makeExecutor(
        'webhook-trigger',
        async () => ({ data: { id: 42 } }),
        'trigger',
      );
      const action = makeExecutor('http-request');
      registry.register(trigger);
      registry.register(action);

      const httpNode = {
        ...node('http', 'http-request'),
        config: { url: '{{BASE_URL}}/items/{{wh.id}}' },
      };
      const def: WorkflowDefinition = {
        nodes: [node('wh', 'webhook-trigger'), httpNode],
        edges: [edge('e1', 'wh', 'http')],
      };

      await runner.run({ executionId: 'exec-both', workflowId: 'wf-1', definition: def });

      expect(action.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { url: 'https://api.example.com/items/42' },
        }),
        expect.any(Object),
      );
    });
  });
});
