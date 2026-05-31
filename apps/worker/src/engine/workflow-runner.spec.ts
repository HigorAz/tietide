import { Test, type TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import type { WorkflowDefinition } from '@tietide/shared';
import type { INodeExecutor, NodeInput, NodeOutput, ExecutionContext } from '@tietide/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { NodeRegistry } from '../nodes/registry';
import { ExecutionEventsService } from '../events/execution-events.service';
import { WorkflowRunner } from './workflow-runner';
import { SECRET_RESOLVER, type SecretResolver } from './secret-resolver';
import { ENV_VAR_RESOLVER, type EnvVarResolver } from './env-var-resolver';
import { CONNECTION_RESOLVER, type ConnectionResolver } from '../connections/connection-resolver';

interface ChildLoggerMock {
  warn: jest.Mock;
  info: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
  child: jest.Mock;
}

interface PinoLoggerMock {
  child: jest.Mock<ChildLoggerMock, [Record<string, unknown>]>;
}

interface NestjsPinoLoggerMock {
  logger: PinoLoggerMock;
  setContext: jest.Mock;
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
  trace: jest.Mock;
  fatal: jest.Mock;
}

function createLoggerMock(): { logger: NestjsPinoLoggerMock; child: ChildLoggerMock } {
  const child: ChildLoggerMock = {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  };
  child.child.mockReturnValue(child);
  const logger: NestjsPinoLoggerMock = {
    logger: { child: jest.fn().mockReturnValue(child) },
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
  };
  return { logger, child };
}

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

const errorEdge = (id: string, source: string, target: string) => ({
  id,
  source,
  target,
  kind: 'error' as const,
});

interface PrismaStepMock {
  create: jest.Mock;
  update: jest.Mock;
  findMany: jest.Mock;
  deleteMany: jest.Mock;
}

interface PrismaMock {
  executionStep: PrismaStepMock;
}

interface EventsMock {
  publishStepStarted: jest.Mock;
  publishStepCompleted: jest.Mock;
  publishStepFailed: jest.Mock;
  publishStepSkipped: jest.Mock;
  publishExecutionCompleted: jest.Mock;
}

describe('WorkflowRunner', () => {
  let runner: WorkflowRunner;
  let registry: NodeRegistry;
  let prisma: PrismaMock;
  let secretResolver: SecretResolver;
  let envVarResolver: EnvVarResolver & {
    getEnvScope: jest.Mock;
    releaseExecution: jest.Mock;
  };
  let connectionResolver: ConnectionResolver & {
    getConnection: jest.Mock;
    markForRefresh: jest.Mock;
    releaseExecution: jest.Mock;
  };
  let events: EventsMock;
  let loggerMock: NestjsPinoLoggerMock;
  let childLogger: ChildLoggerMock;

  beforeEach(async () => {
    const created = createLoggerMock();
    loggerMock = created.logger;
    childLogger = created.child;
    registry = new NodeRegistry();

    prisma = {
      executionStep: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: `step-${data.nodeId}`,
          ...data,
        })),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => data),
        // Step-level resume (W1.8): default to "no prior steps" so the first
        // attempt of every existing test behaves exactly as before.
        findMany: jest.fn(async () => []),
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
    };

    secretResolver = {
      getSecret: jest.fn(async () => 'resolved-secret'),
      releaseExecution: jest.fn(),
    };

    envVarResolver = {
      getEnvScope: jest.fn(async () => new Map<string, string>()),
      releaseExecution: jest.fn(),
    };

    connectionResolver = {
      getConnection: jest.fn(async () => ({
        id: 'conn-default',
        type: 'OAUTH2',
        provider: 'google',
        config: {},
      })),
      markForRefresh: jest.fn(async () => undefined),
      releaseExecution: jest.fn(),
    } as unknown as ConnectionResolver & {
      getConnection: jest.Mock;
      markForRefresh: jest.Mock;
      releaseExecution: jest.Mock;
    };

    events = {
      publishStepStarted: jest.fn(async () => undefined),
      publishStepCompleted: jest.fn(async () => undefined),
      publishStepFailed: jest.fn(async () => undefined),
      publishStepSkipped: jest.fn(async () => undefined),
      publishExecutionCompleted: jest.fn(async () => undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowRunner,
        { provide: NodeRegistry, useValue: registry },
        { provide: PrismaService, useValue: prisma },
        { provide: SECRET_RESOLVER, useValue: secretResolver },
        { provide: ENV_VAR_RESOLVER, useValue: envVarResolver },
        { provide: CONNECTION_RESOLVER, useValue: connectionResolver },
        { provide: ExecutionEventsService, useValue: events },
        { provide: PinoLogger, useValue: loggerMock },
      ],
    }).compile();

    runner = moduleRef.get(WorkflowRunner);
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

      const writes = [
        ...prisma.executionStep.create.mock.calls,
        ...prisma.executionStep.update.mock.calls,
      ].map((c) => c[0].data);
      const statusByNode = new Map<string, string>();
      for (const w of writes) statusByNode.set(w.nodeId as string, w.status as string);
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

    describe('requestId correlation (Issue #162)', () => {
      it('should bind requestId on the child pino logger when one is supplied', async () => {
        registry.register(
          makeExecutor('a', async () => {
            throw new Error('kaboom');
          }),
        );
        const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

        await runner.run({
          executionId: 'exec-1',
          workflowId: 'wf-1',
          definition: def,
          requestId: 'req-xyz',
        });

        expect(loggerMock.logger.child).toHaveBeenCalledWith(
          expect.objectContaining({ requestId: 'req-xyz' }),
        );
        expect(childLogger.warn).toHaveBeenCalled();
        const warnArgs = childLogger.warn.mock.calls[0];
        expect(warnArgs[0]).toEqual(
          expect.objectContaining({ executionId: 'exec-1', nodeId: 'A' }),
        );
      });

      it('should not bind a requestId field when no requestId is supplied', async () => {
        registry.register(
          makeExecutor('a', async () => {
            throw new Error('boom');
          }),
        );
        const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

        await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

        expect(loggerMock.logger.child).toHaveBeenCalled();
        const childArgs = loggerMock.logger.child.mock.calls[0][0] as Record<string, unknown>;
        expect(childArgs).not.toHaveProperty('requestId');
      });
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

    it('should record an un-taken conditional branch node as SKIPPED (not CANCELLED)', async () => {
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

      // The branch was not selected — it was skipped, not cancelled by a failure.
      const creates = prisma.executionStep.create.mock.calls.map((c) => c[0].data);
      const falseStep = creates.find((s) => s.nodeId === 'FALSE');
      expect(falseStep).toBeDefined();
      expect(falseStep!.status).toBe('SKIPPED');
      // Single terminal write — no redundant follow-up update for the skipped node.
      const falseUpdate = prisma.executionStep.update.mock.calls
        .map((c) => c[0].data)
        .find((u) => u.nodeId === 'FALSE');
      expect(falseUpdate).toBeUndefined();
    });

    it('should record a CANCELLED node in a single write (no redundant update)', async () => {
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

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      const cCreate = prisma.executionStep.create.mock.calls
        .map((c) => c[0].data)
        .find((s) => s.nodeId === 'C');
      expect(cCreate!.status).toBe('CANCELLED');
      const cUpdate = prisma.executionStep.update.mock.calls
        .map((c) => c[0].data)
        .find((u) => u.nodeId === 'C');
      expect(cUpdate).toBeUndefined();
    });

    it('should merge ALL executed predecessor outputs keyed by nodeId on fan-in', async () => {
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
      // Neither branch is dropped: both predecessor outputs are present, keyed by
      // their source nodeId, so a fan-in/join node can read from every branch.
      expect(mergeInput.data).toEqual({ L: { src: 'left' }, R: { src: 'right' } });
    });

    it('should keep a single predecessor output flat (linear chain passthrough)', async () => {
      registry.register(makeExecutor('trigger', async () => ({ data: {} }), 'trigger'));
      registry.register(makeExecutor('producer', async () => ({ data: { value: 42 } })));
      const consumer = makeExecutor('consumer');
      registry.register(consumer);

      const def: WorkflowDefinition = {
        nodes: [node('T', 'trigger'), node('P', 'producer'), node('C', 'consumer')],
        edges: [edge('e1', 'T', 'P'), edge('e2', 'P', 'C')],
      };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      // One predecessor → flat output, NOT keyed by nodeId (back-compat).
      expect(consumer.execute.mock.calls[0][0].data).toEqual({ value: 42 });
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

    it('should expose the run requestId on the node ExecutionContext', async () => {
      const exec = makeExecutor('a');
      registry.register(exec);

      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: def,
        requestId: 'req-corr-1',
      });

      expect(exec.execute.mock.calls[0][1].requestId).toBe('req-corr-1');
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

    it('should delegate context.getConnection to ConnectionResolver with executionId', async () => {
      const exec = makeExecutor('a', async (_input, ctx) => {
        const conn = await ctx.getConnection('conn-1');
        return { data: { provider: conn.provider } };
      });
      registry.register(exec);

      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      expect(connectionResolver.getConnection).toHaveBeenCalledWith('exec-1', 'conn-1');
    });

    it('should delegate context.markConnectionForRefresh to ConnectionResolver with executionId', async () => {
      const exec = makeExecutor('a', async (_input, ctx) => {
        await ctx.markConnectionForRefresh('conn-1');
        return { data: {} };
      });
      registry.register(exec);

      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      expect(connectionResolver.markForRefresh).toHaveBeenCalledWith('exec-1', 'conn-1');
    });

    it('should expose isDryRun=false on ExecutionContext by default', async () => {
      const exec = makeExecutor('a');
      registry.register(exec);

      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      const ctx = exec.execute.mock.calls[0][1];
      expect(ctx.isDryRun).toBe(false);
    });

    it('should expose isDryRun=true on ExecutionContext when run() is called with isDryRun:true', async () => {
      const exec = makeExecutor('a');
      registry.register(exec);

      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({
        executionId: 'exec-1',
        workflowId: 'wf-1',
        definition: def,
        isDryRun: true,
      });

      const ctx = exec.execute.mock.calls[0][1];
      expect(ctx.isDryRun).toBe(true);
    });

    it('should call ConnectionResolver.releaseExecution exactly once after a successful run', async () => {
      registry.register(makeExecutor('a'));
      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({ executionId: 'exec-conn-ok', workflowId: 'wf-1', definition: def });

      expect(connectionResolver.releaseExecution).toHaveBeenCalledTimes(1);
      expect(connectionResolver.releaseExecution).toHaveBeenCalledWith('exec-conn-ok');
    });

    it('should lift node.config.connectionId to top-level input.connectionId', async () => {
      const exec = makeExecutor('a');
      registry.register(exec);

      const def: WorkflowDefinition = {
        nodes: [
          {
            id: 'A',
            type: 'a',
            name: 'A',
            position: { x: 0, y: 0 },
            config: { connectionId: 'conn-xyz', other: 'value' },
          },
        ],
        edges: [],
      };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      const input = exec.execute.mock.calls[0][0];
      expect(input.connectionId).toBe('conn-xyz');
      expect(input.params).toEqual({ connectionId: 'conn-xyz', other: 'value' });
    });

    it('should leave input.connectionId undefined when node has no connectionId in config', async () => {
      const exec = makeExecutor('a');
      registry.register(exec);

      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

      const input = exec.execute.mock.calls[0][0];
      expect(input.connectionId).toBeUndefined();
    });

    it('should call SecretResolver.releaseExecution exactly once after a successful run', async () => {
      registry.register(makeExecutor('a'));
      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      await runner.run({ executionId: 'exec-release-ok', workflowId: 'wf-1', definition: def });

      expect(secretResolver.releaseExecution).toHaveBeenCalledTimes(1);
      expect(secretResolver.releaseExecution).toHaveBeenCalledWith('exec-release-ok');
    });

    it('should call SecretResolver.releaseExecution exactly once even when a node throws', async () => {
      registry.register(
        makeExecutor('a', async () => {
          throw new Error('boom');
        }),
      );
      const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

      const result = await runner.run({
        executionId: 'exec-release-fail',
        workflowId: 'wf-1',
        definition: def,
      });

      expect(result.status).toBe('FAILED');
      expect(secretResolver.releaseExecution).toHaveBeenCalledTimes(1);
      expect(secretResolver.releaseExecution).toHaveBeenCalledWith('exec-release-fail');
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

    describe('node skip toggle', () => {
      it('should mark a skipped node as SKIPPED and not invoke its executor', async () => {
        registry.register(makeExecutor('a'));
        const skipped = makeExecutor('b');
        registry.register(skipped);

        const def: WorkflowDefinition = {
          nodes: [node('A', 'a'), { ...node('B', 'b'), skipped: true }],
          edges: [edge('e1', 'A', 'B')],
        };

        const result = await runner.run({
          executionId: 'exec-1',
          workflowId: 'wf-1',
          definition: def,
          triggerData: { origin: 'manual' },
        });

        expect(result.status).toBe('SUCCESS');
        expect(skipped.execute).not.toHaveBeenCalled();

        const updates = prisma.executionStep.update.mock.calls.map((c) => c[0].data);
        const bUpdate = updates.find((u) => u.nodeId === 'B');
        expect(bUpdate).toBeDefined();
        expect(bUpdate!.status).toBe('SKIPPED');
      });

      it('should record passthrough output and forwarded input on a skipped step', async () => {
        registry.register(makeExecutor('a', async () => ({ data: { value: 42 } })));
        registry.register(makeExecutor('b'));

        const def: WorkflowDefinition = {
          nodes: [node('A', 'a'), { ...node('B', 'b'), skipped: true }],
          edges: [edge('e1', 'A', 'B')],
        };

        await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

        const updates = prisma.executionStep.update.mock.calls.map((c) => c[0].data);
        const bUpdate = updates.find((u) => u.nodeId === 'B');
        expect(bUpdate!.inputData).toEqual({ value: 42 });
        expect(bUpdate!.outputData).toEqual({ skipped: true, passthrough: { value: 42 } });
      });

      it('should forward upstream input transparently to downstream nodes', async () => {
        registry.register(makeExecutor('a', async () => ({ data: { value: 42 } })));
        registry.register(makeExecutor('b'));
        const c = makeExecutor('c');
        registry.register(c);

        const def: WorkflowDefinition = {
          nodes: [node('A', 'a'), { ...node('B', 'b'), skipped: true }, node('C', 'c')],
          edges: [edge('e1', 'A', 'B'), edge('e2', 'B', 'C')],
        };

        await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

        expect(c.execute).toHaveBeenCalledTimes(1);
        const cInput = c.execute.mock.calls[0][0];
        expect(cInput.data).toEqual({ value: 42 });
      });

      it('should chain pass-through across multiple consecutive skipped nodes', async () => {
        registry.register(makeExecutor('a', async () => ({ data: { value: 42 } })));
        registry.register(makeExecutor('b'));
        registry.register(makeExecutor('c'));
        const d = makeExecutor('d');
        registry.register(d);

        const def: WorkflowDefinition = {
          nodes: [
            node('A', 'a'),
            { ...node('B', 'b'), skipped: true },
            { ...node('C', 'c'), skipped: true },
            node('D', 'd'),
          ],
          edges: [edge('e1', 'A', 'B'), edge('e2', 'B', 'C'), edge('e3', 'C', 'D')],
        };

        await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

        expect(d.execute).toHaveBeenCalledTimes(1);
        expect(d.execute.mock.calls[0][0].data).toEqual({ value: 42 });

        const updates = prisma.executionStep.update.mock.calls.map((c) => c[0].data);
        const statusByNode = new Map<string, string>();
        for (const u of updates) statusByNode.set(u.nodeId as string, u.status as string);
        expect(statusByNode.get('B')).toBe('SKIPPED');
        expect(statusByNode.get('C')).toBe('SKIPPED');
        expect(statusByNode.get('D')).toBe('SUCCESS');
      });

      it('should still invoke the executor when skipped is explicitly false', async () => {
        registry.register(makeExecutor('a'));
        const b = makeExecutor('b');
        registry.register(b);

        const def: WorkflowDefinition = {
          nodes: [node('A', 'a'), { ...node('B', 'b'), skipped: false }],
          edges: [edge('e1', 'A', 'B')],
        };

        await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

        expect(b.execute).toHaveBeenCalledTimes(1);
      });

      it.each([['manual-trigger'], ['cron-trigger'], ['webhook-trigger']])(
        'should ignore skipped:true on a trigger node (type=%s) and execute it normally',
        async (triggerType) => {
          const trigger = makeExecutor(
            triggerType,
            async () => ({ data: { fired: true } }),
            'trigger',
          );
          registry.register(trigger);

          const def: WorkflowDefinition = {
            nodes: [{ ...node('T', triggerType), skipped: true }],
            edges: [],
          };

          await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

          expect(trigger.execute).toHaveBeenCalledTimes(1);
          const updates = prisma.executionStep.update.mock.calls.map((c) => c[0].data);
          const tUpdate = updates.find((u) => u.nodeId === 'T');
          expect(tUpdate!.status).toBe('SUCCESS');
        },
      );

      it('should propagate reachability past a skipped node on a branch edge', async () => {
        registry.register(makeExecutor('trigger', async () => ({ data: {} }), 'trigger'));
        registry.register(
          makeExecutor('if', async () => ({ data: {}, metadata: { branch: 'true' } }), 'logic'),
        );
        registry.register(makeExecutor('skipMid'));
        const truePath = makeExecutor('truePath');
        registry.register(truePath);
        registry.register(makeExecutor('falsePath'));

        const def: WorkflowDefinition = {
          nodes: [
            node('T', 'trigger'),
            node('IF', 'if'),
            { ...node('S', 'skipMid'), skipped: true },
            node('TRUE', 'truePath'),
            node('FALSE', 'falsePath'),
          ],
          edges: [
            edge('e1', 'T', 'IF'),
            edge('e2', 'IF', 'S', 'true'),
            edge('e3', 'S', 'TRUE'),
            edge('e4', 'IF', 'FALSE', 'false'),
          ],
        };

        await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

        expect(truePath.execute).toHaveBeenCalledTimes(1);
      });
    });

    describe('execution event emission', () => {
      it('should emit step.started + step.completed for each node in topological order', async () => {
        registry.register(makeExecutor('a'));
        registry.register(makeExecutor('b'));

        const def: WorkflowDefinition = {
          nodes: [node('A', 'a'), node('B', 'b')],
          edges: [edge('e1', 'A', 'B')],
        };

        await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

        const startedNodes = events.publishStepStarted.mock.calls.map((c) => c[0].nodeId);
        const completedNodes = events.publishStepCompleted.mock.calls.map((c) => c[0].nodeId);
        expect(startedNodes).toEqual(['A', 'B']);
        expect(completedNodes).toEqual(['A', 'B']);
        expect(events.publishStepFailed).not.toHaveBeenCalled();
      });

      it('should emit step.started before step.completed for the same node', async () => {
        registry.register(makeExecutor('a'));
        const sequence: string[] = [];
        events.publishStepStarted.mockImplementation(async ({ nodeId }) => {
          sequence.push(`started:${nodeId}`);
        });
        events.publishStepCompleted.mockImplementation(async ({ nodeId }) => {
          sequence.push(`completed:${nodeId}`);
        });

        const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };
        await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

        expect(sequence).toEqual(['started:A', 'completed:A']);
      });

      it('should emit step.failed (not step.completed) when a node throws', async () => {
        registry.register(
          makeExecutor('a', async () => {
            throw new Error('kaboom');
          }),
        );
        const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

        await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

        expect(events.publishStepStarted).toHaveBeenCalledTimes(1);
        expect(events.publishStepFailed).toHaveBeenCalledTimes(1);
        expect(events.publishStepCompleted).not.toHaveBeenCalled();
        const failedArgs = events.publishStepFailed.mock.calls[0][0];
        expect(failedArgs.nodeId).toBe('A');
        expect(failedArgs.error.message).toContain('kaboom');
      });

      it('should emit step.skipped (and not step.started) for a skipped node', async () => {
        registry.register(makeExecutor('a', async () => ({ data: { value: 42 } })));
        registry.register(makeExecutor('b'));

        const def: WorkflowDefinition = {
          nodes: [node('A', 'a'), { ...node('B', 'b'), skipped: true }],
          edges: [edge('e1', 'A', 'B')],
        };

        await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

        const startedNodes = events.publishStepStarted.mock.calls.map((c) => c[0].nodeId);
        const skippedNodes = events.publishStepSkipped.mock.calls.map((c) => c[0].nodeId);
        expect(startedNodes).toEqual(['A']);
        expect(skippedNodes).toEqual(['B']);
        const skippedArgs = events.publishStepSkipped.mock.calls[0][0];
        expect(skippedArgs.input).toEqual({ value: 42 });
        expect(skippedArgs.output).toEqual({
          skipped: true,
          passthrough: { value: 42 },
        });
      });

      it("should pass raw input/output through to events (sanitization is the service's job)", async () => {
        registry.register(makeExecutor('a', async () => ({ data: { token: 'tk', body: 'ok' } })));
        const def: WorkflowDefinition = { nodes: [node('A', 'a')], edges: [] };

        await runner.run({
          executionId: 'exec-1',
          workflowId: 'wf-1',
          definition: def,
          triggerData: { password: 'p' },
        });

        const completedArgs = events.publishStepCompleted.mock.calls[0][0];
        expect(completedArgs.input).toEqual({ password: 'p' });
        expect(completedArgs.output).toEqual({ token: 'tk', body: 'ok' });
      });

      it('should not emit any step events for CANCELLED downstream nodes', async () => {
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

        await runner.run({ executionId: 'exec-1', workflowId: 'wf-1', definition: def });

        const allNodeIdsSeen = [
          ...events.publishStepStarted.mock.calls,
          ...events.publishStepCompleted.mock.calls,
          ...events.publishStepFailed.mock.calls,
          ...events.publishStepSkipped.mock.calls,
        ].map((c) => c[0].nodeId);
        expect(allNodeIdsSeen).not.toContain('C');
      });
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
