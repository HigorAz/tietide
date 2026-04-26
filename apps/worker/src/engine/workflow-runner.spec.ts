import { Test, type TestingModule } from '@nestjs/testing';
import type { WorkflowDefinition } from '@tietide/shared';
import type { INodeExecutor, NodeInput, NodeOutput, ExecutionContext } from '@tietide/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { NodeRegistry } from '../nodes/registry';
import { WorkflowRunner } from './workflow-runner';
import { SECRET_RESOLVER, type SecretResolver } from './secret-resolver';

type CallableExecutor = INodeExecutor & {
  execute: jest.Mock<Promise<NodeOutput>, [NodeInput, ExecutionContext]>;
};

const makeExecutor = (
  type: string,
  impl: (input: NodeInput, ctx: ExecutionContext) => Promise<NodeOutput> = async () => ({
    data: { ran: type },
  }),
  category: 'trigger' | 'action' | 'logic' = 'action',
): CallableExecutor => ({
  type,
  name: type,
  description: type,
  category,
  execute: jest.fn(impl),
});

const node = (id: string, type: string, name = id) => ({
  id,
  type,
  name,
  position: { x: 0, y: 0 },
  config: {},
});

const edge = (id: string, source: string, target: string, sourceHandle?: string) => ({
  id,
  source,
  target,
  ...(sourceHandle ? { sourceHandle } : {}),
});

interface PrismaStepMock {
  create: jest.Mock;
  update: jest.Mock;
}

interface PrismaMock {
  executionStep: PrismaStepMock;
}

describe('WorkflowRunner', () => {
  let runner: WorkflowRunner;
  let registry: NodeRegistry;
  let prisma: PrismaMock;
  let secretResolver: SecretResolver;

  beforeEach(async () => {
    registry = new NodeRegistry();

    prisma = {
      executionStep: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: `step-${data.nodeId}`,
          ...data,
        })),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => data),
      },
    };

    secretResolver = {
      getSecret: jest.fn(async () => 'resolved-secret'),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowRunner,
        { provide: NodeRegistry, useValue: registry },
        { provide: PrismaService, useValue: prisma },
        { provide: SECRET_RESOLVER, useValue: secretResolver },
      ],
    }).compile();

    runner = moduleRef.get(WorkflowRunner);
  });

  describe('run', () => {
    it('should execute a single trigger node and return SUCCESS', async () => {
      const trigger = makeExecutor(
        'manual-trigger',
        async () => ({ data: { started: true } }),
        'trigger',
      );
      registry.register(trigger);

      const def: WorkflowDefinition = {
        nodes: [node('t1', 'manual-trigger')],
        edges: [],
      };

      const result = await runner.run({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: def,
        triggerData: { foo: 'bar' },
      });

      expect(result.status).toBe('SUCCESS');
      expect(trigger.execute).toHaveBeenCalledTimes(1);
      expect(prisma.executionStep.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            executionId: 'exec-1',
            nodeId: 't1',
            nodeType: 'manual-trigger',
            status: 'RUNNING',
          }),
        }),
      );
    });

    it('should pass previous node output as data input to next node', async () => {
      const a = makeExecutor('a', async () => ({ data: { value: 42 } }));
      const b = makeExecutor('b');
      registry.register(a);
      registry.register(b);

      const def: WorkflowDefinition = {
        nodes: [node('A', 'a'), node('B', 'b')],
        edges: [edge('e1', 'A', 'B')],
      };

      await runner.run({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: def,
        triggerData: { origin: 'manual' },
      });

      expect(a.execute).toHaveBeenCalledWith(
        expect.objectContaining({ data: { origin: 'manual' } }),
        expect.any(Object),
      );
      expect(b.execute).toHaveBeenCalledWith(
        expect.objectContaining({ data: { value: 42 } }),
        expect.any(Object),
      );
    });

    it('should execute nodes in topological order for a linear chain', async () => {
      const calls: string[] = [];
      const mk = (t: string) =>
        makeExecutor(t, async () => {
          calls.push(t);
          return { data: {} };
        });
      registry.register(mk('a'));
      registry.register(mk('b'));
      registry.register(mk('c'));

      const def: WorkflowDefinition = {
        nodes: [node('C', 'c'), node('A', 'a'), node('B', 'b')],
        edges: [edge('e1', 'A', 'B'), edge('e2', 'B', 'C')],
      };

      await runner.run({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: def,
      });

      expect(calls).toEqual(['a', 'b', 'c']);
    });

    it('should create ExecutionStep PENDING/RUNNING then update to SUCCESS', async () => {
      registry.register(makeExecutor('a'));
      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      expect(prisma.executionStep.create).toHaveBeenCalledTimes(1);
      expect(prisma.executionStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SUCCESS' }),
        }),
      );
    });

    it('should record durationMs on successful step', async () => {
      registry.register(makeExecutor('a'));
      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      const updateCall = prisma.executionStep.update.mock.calls[0][0];
      expect(updateCall.data.durationMs).toEqual(expect.any(Number));
      expect(updateCall.data.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should persist inputData and outputData on each step', async () => {
      registry.register(makeExecutor('a', async () => ({ data: { out: 'hello' } })));
      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: def,
        triggerData: { in: 'world' },
      });

      const updateCall = prisma.executionStep.update.mock.calls[0][0];
      expect(updateCall.data.inputData).toEqual({ in: 'world' });
      expect(updateCall.data.outputData).toEqual({ out: 'hello' });
    });

    it('should mark remaining nodes CANCELLED when a middle node fails', async () => {
      registry.register(makeExecutor('a'));
      registry.register(
        makeExecutor('b', async () => {
          throw new Error('boom');
        }),
      );
      registry.register(makeExecutor('c'));

      const def: WorkflowDefinition = {
        nodes: [node('A', 'a'), node('B', 'b'), node('C', 'c')],
        edges: [edge('e1', 'A', 'B'), edge('e2', 'B', 'C')],
      };

      const result = await runner.run({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: def,
      });

      expect(result.status).toBe('FAILED');
      expect(result.failedNodeId).toBe('B');

      const updates = prisma.executionStep.update.mock.calls.map((c) => c[0].data);
      const statusByNode = new Map<string, string>();
      for (const u of updates) statusByNode.set(u.nodeId as string, u.status as string);
      expect(statusByNode.get('A')).toBe('SUCCESS');
      expect(statusByNode.get('B')).toBe('FAILED');
      expect(statusByNode.get('C')).toBe('CANCELLED');
    });

    it('should mark step FAILED with error message when executor throws', async () => {
      registry.register(
        makeExecutor('a', async () => {
          throw new Error('kaboom');
        }),
      );
      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      const updateCall = prisma.executionStep.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('FAILED');
      expect(updateCall.data.error).toContain('kaboom');
    });

    it('should abort with clear error when NodeRegistry has no executor for a node type', async () => {
      const def: WorkflowDefinition = { nodes: [node('A', 'missing')], edges: [] };

      const result = await runner.run({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: def,
      });

      expect(result.status).toBe('FAILED');
      expect(result.error).toMatch(/no executor.*missing/i);
      expect(prisma.executionStep.create).not.toHaveBeenCalled();
    });

    it('should follow only true-branch nodes when IF returns branch:true', async () => {
      registry.register(makeExecutor('trigger', async () => ({ data: {} }), 'trigger'));
      registry.register(
        makeExecutor('if', async () => ({ data: {}, metadata: { branch: 'true' } }), 'logic'),
      );
      const truePath = makeExecutor('truePath');
      const falsePath = makeExecutor('falsePath');
      registry.register(truePath);
      registry.register(falsePath);

      const def: WorkflowDefinition = {
        nodes: [
          node('T', 'trigger'),
          node('IF', 'if'),
          node('TRUE', 'truePath'),
          node('FALSE', 'falsePath'),
        ],
        edges: [
          edge('e1', 'T', 'IF'),
          edge('e2', 'IF', 'TRUE', 'true'),
          edge('e3', 'IF', 'FALSE', 'false'),
        ],
      };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      expect(truePath.execute).toHaveBeenCalledTimes(1);
      expect(falsePath.execute).not.toHaveBeenCalled();
    });

    it('should create CANCELLED step records for unreachable branch nodes', async () => {
      registry.register(makeExecutor('trigger', async () => ({ data: {} }), 'trigger'));
      registry.register(
        makeExecutor('if', async () => ({ data: {}, metadata: { branch: 'true' } }), 'logic'),
      );
      registry.register(makeExecutor('truePath'));
      registry.register(makeExecutor('falsePath'));

      const def: WorkflowDefinition = {
        nodes: [
          node('T', 'trigger'),
          node('IF', 'if'),
          node('TRUE', 'truePath'),
          node('FALSE', 'falsePath'),
        ],
        edges: [
          edge('e1', 'T', 'IF'),
          edge('e2', 'IF', 'TRUE', 'true'),
          edge('e3', 'IF', 'FALSE', 'false'),
        ],
      };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      const updates = prisma.executionStep.update.mock.calls.map((c) => c[0].data);
      const falseUpdate = updates.find((u) => u.nodeId === 'FALSE');
      expect(falseUpdate).toBeDefined();
      expect(falseUpdate!.status).toBe('CANCELLED');
    });

    it('should use the last executed predecessor output when node has multiple in-edges (MVP)', async () => {
      registry.register(makeExecutor('trigger', async () => ({ data: {} }), 'trigger'));
      registry.register(makeExecutor('leftBranch', async () => ({ data: { src: 'left' } })));
      registry.register(makeExecutor('rightBranch', async () => ({ data: { src: 'right' } })));
      const merge = makeExecutor('merge');
      registry.register(merge);

      const def: WorkflowDefinition = {
        nodes: [
          node('T', 'trigger'),
          node('L', 'leftBranch'),
          node('R', 'rightBranch'),
          node('M', 'merge'),
        ],
        edges: [
          edge('e1', 'T', 'L'),
          edge('e2', 'T', 'R'),
          edge('e3', 'L', 'M'),
          edge('e4', 'R', 'M'),
        ],
      };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      expect(merge.execute).toHaveBeenCalledTimes(1);
      const mergeInput = merge.execute.mock.calls[0][0];
      expect(['left', 'right']).toContain(mergeInput.data.src);
    });

    it('should provide ExecutionContext with correct executionId/workflowId/nodeId', async () => {
      const exec = makeExecutor('a');
      registry.register(exec);

      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({ executionId: 'exec-42', workflowId: 'wf-99', definition: def });

      const ctx = exec.execute.mock.calls[0][1];
      expect(ctx.executionId).toBe('exec-42');
      expect(ctx.workflowId).toBe('wf-99');
      expect(ctx.nodeId).toBe('A');
    });

    it('should delegate context.getSecret to SecretResolver with executionId', async () => {
      const exec = makeExecutor('a', async (_input, ctx) => {
        const value = await ctx.getSecret('api-key');
        return { data: { secret: value } };
      });
      registry.register(exec);

      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      expect(secretResolver.getSecret).toHaveBeenCalledWith('exec-1', 'api-key');
    });

    it('should return FAILED when topologicalSort detects a circular dependency', async () => {
      registry.register(makeExecutor('a'));
      registry.register(makeExecutor('b'));

      // Two-node cycle: A -> B -> A. No node has in-degree zero.
      const def: WorkflowDefinition = {
        nodes: [node('A', 'a'), node('B', 'b')],
        edges: [edge('e1', 'A', 'B'), edge('e2', 'B', 'A')],
      };

      const result = await runner.run({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: def,
      });

      expect(result.status).toBe('FAILED');
      expect(result.error).toMatch(/circular dependency/i);
      expect(prisma.executionStep.create).not.toHaveBeenCalled();
    });

    it('should return FAILED with error message when topologicalSort throws non-cycle error', async () => {
      registry.register(makeExecutor('a'));

      // Empty workflow → topologicalSort throws a plain Error (not CircularDependencyError)
      const def: WorkflowDefinition = { nodes: [], edges: [] };

      const result = await runner.run({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: def,
      });

      expect(result.status).toBe('FAILED');
      expect(result.error).toMatch(/at least one node/i);
    });

    it('should expose a working logger on ExecutionContext (info/warn/error/debug)', async () => {
      const exec = makeExecutor('a', async (_input, ctx) => {
        ctx.logger.info('info-msg', { k: 1 });
        ctx.logger.warn('warn-msg', { k: 2 });
        ctx.logger.error('error-msg', { k: 3 });
        ctx.logger.debug('debug-msg', { k: 4 });
        return { data: {} };
      });
      registry.register(exec);

      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      const result = await runner.run({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: def,
      });

      expect(result.status).toBe('SUCCESS');
      expect(exec.execute).toHaveBeenCalledTimes(1);
    });

    it('should pass node config as params to the executor', async () => {
      const exec = makeExecutor('a');
      registry.register(exec);

      const def: WorkflowDefinition = {
        nodes: [
          {
            id: 'A',
            type: 'a',
            name: 'A',
            position: { x: 0, y: 0 },
            config: { url: 'https://example.com', method: 'GET' },
          },
        ],
        edges: [],
      };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      expect(exec.execute).toHaveBeenCalledWith(
        expect.objectContaining({ params: { url: 'https://example.com', method: 'GET' } }),
        expect.any(Object),
      );
    });
  });
});
