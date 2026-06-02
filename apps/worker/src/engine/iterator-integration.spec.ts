// Integration spec for the iterator runner path. Exercises WorkflowRunner +
// the iterator special-case end-to-end against an in-memory Prisma double so
// we can assert that child WorkflowExecution rows are created with the right
// parentExecutionId / triggerData / triggerType and that the body subgraph
// runs once per array item.
//
// Mocks: prisma (in-memory tables for workflowExecution + executionStep),
// secret/env-var/connection resolvers, ExecutionEventsService (records calls).
// Real: WorkflowRunner, NodeRegistry, IteratorNode, manual-trigger.

import { Test, type TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import type { WorkflowDefinition } from '@tietide/shared';
import type { INodeExecutor, NodeInput, NodeOutput, ExecutionContext } from '@tietide/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { NodeRegistry } from '../nodes/registry';
import { ExecutionEventsService } from '../events/execution-events.service';
import { ManualTrigger } from '../nodes/triggers/manual-trigger';
import { IteratorNode } from '../nodes/logic/iterator';
import { WorkflowRunner } from './workflow-runner';
import { IteratorExecutor } from './iterator-executor';
import { SECRET_RESOLVER, type SecretResolver } from './secret-resolver';
import { ENV_VAR_RESOLVER, type EnvVarResolver } from './env-var-resolver';
import { CONNECTION_RESOLVER, type ConnectionResolver } from '../connections/connection-resolver';

function makePinoLoggerStub(): unknown {
  const noopChild = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  };
  noopChild.child.mockReturnValue(noopChild);
  return {
    logger: { child: jest.fn().mockReturnValue(noopChild) },
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
  };
}

interface FakeWorkflowExecution {
  id: string;
  workflowId: string;
  parentExecutionId: string | null;
  status: string;
  triggerType: string;
  triggerData: unknown;
  isDryRun: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
  error: string | null;
  idempotencyKey: string | null;
}

interface FakeExecutionStep {
  id: string;
  executionId: string;
  nodeId: string;
  nodeType: string;
  nodeName: string;
  status: string;
  inputData?: unknown;
  outputData?: unknown;
  error?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  durationMs?: number | null;
}

const node = (id: string, type: string, name = id, config: Record<string, unknown> = {}) => ({
  id,
  type,
  name,
  position: { x: 0, y: 0 },
  config,
});

const edge = (id: string, source: string, target: string, sourceHandle?: string) => ({
  id,
  source,
  target,
  ...(sourceHandle ? { sourceHandle } : {}),
});

describe('WorkflowRunner — iterator integration', () => {
  let runner: WorkflowRunner;
  let registry: NodeRegistry;
  let workflowExecutions: FakeWorkflowExecution[];
  let steps: FakeExecutionStep[];
  let weCreate: jest.Mock;
  let weUpdate: jest.Mock;
  let weFindFirst: jest.Mock;
  let stepCreate: jest.Mock;
  let stepUpdate: jest.Mock;
  let publishStepStarted: jest.Mock;
  let publishStepCompleted: jest.Mock;
  let publishStepFailed: jest.Mock;
  let publishIterationStarted: jest.Mock;
  let publishIterationCompleted: jest.Mock;
  let bodyExecutor: INodeExecutor & {
    execute: jest.Mock<Promise<NodeOutput>, [NodeInput, ExecutionContext]>;
  };
  let postIteratorExecutor: INodeExecutor & {
    execute: jest.Mock<Promise<NodeOutput>, [NodeInput, ExecutionContext]>;
  };

  beforeEach(async () => {
    workflowExecutions = [];
    steps = [];
    let weId = 0;
    let stepId = 0;

    weCreate = jest.fn(
      async ({
        data,
        select,
      }: {
        data: Record<string, unknown>;
        select?: Record<string, boolean>;
      }) => {
        const id = `child-exec-${++weId}`;
        const row: FakeWorkflowExecution = {
          id,
          workflowId: data.workflowId as string,
          parentExecutionId: (data.parentExecutionId as string) ?? null,
          status: (data.status as string) ?? 'PENDING',
          triggerType: data.triggerType as string,
          triggerData: data.triggerData,
          isDryRun: Boolean(data.isDryRun),
          startedAt: (data.startedAt as Date) ?? null,
          finishedAt: null,
          error: null,
          idempotencyKey: (data.idempotencyKey as string) ?? null,
        };
        workflowExecutions.push(row);
        return select ? { id } : row;
      },
    );

    weFindFirst = jest.fn(
      async ({
        where,
        select,
      }: {
        where: { workflowId?: string; idempotencyKey?: string };
        select?: Record<string, boolean>;
      }) => {
        const row = workflowExecutions.find(
          (r) =>
            (where.workflowId === undefined || r.workflowId === where.workflowId) &&
            (where.idempotencyKey === undefined || r.idempotencyKey === where.idempotencyKey),
        );
        if (!row) return null;
        return select ? { id: row.id, status: row.status } : row;
      },
    );

    weUpdate = jest.fn(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = workflowExecutions.find((r) => r.id === where.id);
        if (row) {
          if (data.status !== undefined) row.status = data.status as string;
          if (data.finishedAt !== undefined) row.finishedAt = data.finishedAt as Date;
          if (data.error !== undefined) row.error = (data.error as string) ?? null;
        }
        return row;
      },
    );

    stepCreate = jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const id = `step-${++stepId}`;
      const row: FakeExecutionStep = {
        id,
        executionId: data.executionId as string,
        nodeId: data.nodeId as string,
        nodeType: data.nodeType as string,
        nodeName: data.nodeName as string,
        status: data.status as string,
        startedAt: data.startedAt as Date | null,
      };
      steps.push(row);
      return row;
    });

    stepUpdate = jest.fn(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = steps.find((r) => r.id === where.id);
        if (row) {
          Object.assign(row, data);
        }
        return row;
      },
    );

    publishStepStarted = jest.fn(async () => undefined);
    publishStepCompleted = jest.fn(async () => undefined);
    publishStepFailed = jest.fn(async () => undefined);
    publishIterationStarted = jest.fn(async () => undefined);
    publishIterationCompleted = jest.fn(async () => undefined);

    const prisma = {
      workflowExecution: { create: weCreate, update: weUpdate, findFirst: weFindFirst },
      executionStep: {
        create: stepCreate,
        update: stepUpdate,
        // Step-level resume (W1.8): returns prior steps for an executionId. Each
        // run here uses a fresh executionId and creates its steps during the run,
        // so at run-start this returns [] and resume is a no-op.
        findMany: jest.fn(async ({ where }: { where: { executionId: string } }) =>
          steps
            .filter((r) => r.executionId === where.executionId)
            .map((r) => ({
              id: r.id,
              nodeId: r.nodeId,
              status: r.status,
              outputData: r.outputData ?? null,
            })),
        ),
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
    };

    const secretResolver: SecretResolver = {
      getSecret: jest.fn(async () => 'secret'),
      releaseExecution: jest.fn(),
    };
    const envVarResolver: EnvVarResolver = {
      getEnvScope: jest.fn(async () => new Map<string, string>()),
      releaseExecution: jest.fn(),
    } as unknown as EnvVarResolver;
    const connectionResolver: ConnectionResolver = {
      getConnection: jest.fn(),
      markForRefresh: jest.fn(),
      releaseExecution: jest.fn(),
    } as unknown as ConnectionResolver;
    const events = {
      publishStepStarted,
      publishStepCompleted,
      publishStepFailed,
      publishStepSkipped: jest.fn(async () => undefined),
      publishIterationStarted,
      publishIterationCompleted,
      publishExecutionCompleted: jest.fn(async () => undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowRunner,
        IteratorExecutor,
        NodeRegistry,
        { provide: PrismaService, useValue: prisma },
        { provide: SECRET_RESOLVER, useValue: secretResolver },
        { provide: ENV_VAR_RESOLVER, useValue: envVarResolver },
        { provide: CONNECTION_RESOLVER, useValue: connectionResolver },
        { provide: ExecutionEventsService, useValue: events },
        { provide: PinoLogger, useValue: makePinoLoggerStub() },
      ],
    }).compile();

    runner = moduleRef.get(WorkflowRunner);
    registry = moduleRef.get(NodeRegistry);
    registry.register(new ManualTrigger());
    registry.register(new IteratorNode());

    bodyExecutor = {
      type: 'body-action',
      name: 'body-action',
      description: 'body-action',
      category: 'action',
      execute: jest.fn<Promise<NodeOutput>, [NodeInput, ExecutionContext]>(
        async (input: NodeInput) => ({ data: { receivedItem: input.data } }),
      ),
    };
    registry.register(bodyExecutor);

    postIteratorExecutor = {
      type: 'post-action',
      name: 'post-action',
      description: 'post-action',
      category: 'action',
      execute: jest.fn<Promise<NodeOutput>, [NodeInput, ExecutionContext]>(async () => ({
        data: { ran: 'after-loop' },
      })),
    };
    registry.register(postIteratorExecutor);
  });

  it('should create one child WorkflowExecution per array item with parentExecutionId set', async () => {
    // trigger -> iter (arrayPath = trigger.items) -[body]-> bodyA
    const def: WorkflowDefinition = {
      nodes: [
        node('t1', 'manual-trigger'),
        node('iter1', 'iterator', 'iter1', { arrayPath: '{{t1.items}}' }),
        node('bodyA', 'body-action'),
      ],
      edges: [edge('e1', 't1', 'iter1'), edge('e2', 'iter1', 'bodyA', 'body')],
    };

    const result = await runner.run({
      executionId: 'parent-exec',
      workflowId: 'wf-1',
      definition: def,
      triggerData: { items: ['a', 'b', 'c'] },
    });

    expect(result.status).toBe('SUCCESS');
    const children = workflowExecutions.filter((r) => r.parentExecutionId === 'parent-exec');
    expect(children).toHaveLength(3);
    children.forEach((c) => {
      expect(c.triggerType).toBe('iterator');
      expect(c.parentExecutionId).toBe('parent-exec');
      expect(c.workflowId).toBe('wf-1');
      expect(c.status).toBe('SUCCESS');
    });
  });

  it('should key each iteration child by parentExecutionId+nodeId+index for idempotent re-runs', async () => {
    const def: WorkflowDefinition = {
      nodes: [
        node('t1', 'manual-trigger'),
        node('iter1', 'iterator', 'iter1', { arrayPath: '{{t1.items}}' }),
        node('bodyA', 'body-action'),
      ],
      edges: [edge('e1', 't1', 'iter1'), edge('e2', 'iter1', 'bodyA', 'body')],
    };

    await runner.run({
      executionId: 'parent-exec',
      workflowId: 'wf-1',
      definition: def,
      triggerData: { items: ['a', 'b'] },
    });

    const children = workflowExecutions.filter((r) => r.parentExecutionId === 'parent-exec');
    expect(children.map((c) => c.idempotencyKey)).toEqual([
      'iterator:parent-exec:iter1:0',
      'iterator:parent-exec:iter1:1',
    ]);
  });

  it('should reuse already-SUCCESS iteration children and NOT re-run their body when the parent re-runs', async () => {
    const def: WorkflowDefinition = {
      nodes: [
        node('t1', 'manual-trigger'),
        node('iter1', 'iterator', 'iter1', { arrayPath: '{{t1.items}}' }),
        node('bodyA', 'body-action'),
      ],
      edges: [edge('e1', 't1', 'iter1'), edge('e2', 'iter1', 'bodyA', 'body')],
    };
    const runArgs = {
      executionId: 'parent-exec',
      workflowId: 'wf-1',
      definition: def,
      triggerData: { items: ['a', 'b'] },
    };

    // First processing of this parent execution: both iterations run.
    await runner.run(runArgs);
    expect(bodyExecutor.execute).toHaveBeenCalledTimes(2);
    expect(workflowExecutions.filter((r) => r.parentExecutionId === 'parent-exec')).toHaveLength(2);

    bodyExecutor.execute.mockClear();

    // Re-processing the SAME parent execution (e.g. a future BullMQ retry) must
    // reuse the completed iteration children instead of duplicating side effects.
    const second = await runner.run(runArgs);

    expect(second.status).toBe('SUCCESS');
    expect(bodyExecutor.execute).not.toHaveBeenCalled();
    expect(workflowExecutions.filter((r) => r.parentExecutionId === 'parent-exec')).toHaveLength(2);
  });

  it('should pass correct {item, index, total} as triggerData for each iteration', async () => {
    const def: WorkflowDefinition = {
      nodes: [
        node('t1', 'manual-trigger'),
        node('iter1', 'iterator', 'iter1', { arrayPath: '{{t1.items}}' }),
        node('bodyA', 'body-action'),
      ],
      edges: [edge('e1', 't1', 'iter1'), edge('e2', 'iter1', 'bodyA', 'body')],
    };

    await runner.run({
      executionId: 'parent-exec',
      workflowId: 'wf-1',
      definition: def,
      triggerData: { items: ['x', 'y', 'z'] },
    });

    const children = workflowExecutions.filter((r) => r.parentExecutionId === 'parent-exec');
    expect(children.map((c) => c.triggerData)).toEqual([
      { item: 'x', index: 0, total: 3 },
      { item: 'y', index: 1, total: 3 },
      { item: 'z', index: 2, total: 3 },
    ]);
  });

  it('should run the body executor exactly N times with the iteration scope on its input', async () => {
    const def: WorkflowDefinition = {
      nodes: [
        node('t1', 'manual-trigger'),
        node('iter1', 'iterator', 'iter1', { arrayPath: '{{t1.items}}' }),
        node('bodyA', 'body-action'),
      ],
      edges: [edge('e1', 't1', 'iter1'), edge('e2', 'iter1', 'bodyA', 'body')],
    };

    await runner.run({
      executionId: 'parent-exec',
      workflowId: 'wf-1',
      definition: def,
      triggerData: { items: ['p', 'q'] },
    });

    expect(bodyExecutor.execute).toHaveBeenCalledTimes(2);
    const calls = bodyExecutor.execute.mock.calls.map((c) => c[0].data);
    expect(calls).toEqual([
      { item: 'p', index: 0, total: 2 },
      { item: 'q', index: 1, total: 2 },
    ]);
  });

  it('should not run the body and create zero children for an empty array', async () => {
    const def: WorkflowDefinition = {
      nodes: [
        node('t1', 'manual-trigger'),
        node('iter1', 'iterator', 'iter1', { arrayPath: '{{t1.items}}' }),
        node('bodyA', 'body-action'),
      ],
      edges: [edge('e1', 't1', 'iter1'), edge('e2', 'iter1', 'bodyA', 'body')],
    };

    const result = await runner.run({
      executionId: 'parent-exec',
      workflowId: 'wf-1',
      definition: def,
      triggerData: { items: [] },
    });

    expect(result.status).toBe('SUCCESS');
    expect(bodyExecutor.execute).not.toHaveBeenCalled();
    const children = workflowExecutions.filter((r) => r.parentExecutionId === 'parent-exec');
    expect(children).toHaveLength(0);
  });

  it('should fire the done-handle downstream node exactly once and never the body via the parent loop', async () => {
    // iter -[body]-> bodyA   ;   iter -[done]-> postX
    const def: WorkflowDefinition = {
      nodes: [
        node('t1', 'manual-trigger'),
        node('iter1', 'iterator', 'iter1', { arrayPath: '{{t1.items}}' }),
        node('bodyA', 'body-action'),
        node('postX', 'post-action'),
      ],
      edges: [
        edge('e1', 't1', 'iter1'),
        edge('e2', 'iter1', 'bodyA', 'body'),
        edge('e3', 'iter1', 'postX', 'done'),
      ],
    };

    const result = await runner.run({
      executionId: 'parent-exec',
      workflowId: 'wf-1',
      definition: def,
      triggerData: { items: ['a', 'b'] },
    });

    expect(result.status).toBe('SUCCESS');
    expect(bodyExecutor.execute).toHaveBeenCalledTimes(2); // 2 iterations
    expect(postIteratorExecutor.execute).toHaveBeenCalledTimes(1); // done branch fires once
  });

  it('should fail the parent execution when arrayPath does not resolve to an array', async () => {
    const def: WorkflowDefinition = {
      nodes: [
        node('t1', 'manual-trigger'),
        node('iter1', 'iterator', 'iter1', { arrayPath: '{{t1.notAnArray}}' }),
        node('bodyA', 'body-action'),
      ],
      edges: [edge('e1', 't1', 'iter1'), edge('e2', 'iter1', 'bodyA', 'body')],
    };

    const result = await runner.run({
      executionId: 'parent-exec',
      workflowId: 'wf-1',
      definition: def,
      triggerData: { notAnArray: 'just a string' },
    });

    expect(result.status).toBe('FAILED');
    expect(result.error).toMatch(/did not resolve to an array/i);
    expect(bodyExecutor.execute).not.toHaveBeenCalled();
  });

  it('should publish iteration.started and iteration.completed once per iteration', async () => {
    const def: WorkflowDefinition = {
      nodes: [
        node('t1', 'manual-trigger'),
        node('iter1', 'iterator', 'iter1', { arrayPath: '{{t1.items}}' }),
        node('bodyA', 'body-action'),
      ],
      edges: [edge('e1', 't1', 'iter1'), edge('e2', 'iter1', 'bodyA', 'body')],
    };

    await runner.run({
      executionId: 'parent-exec',
      workflowId: 'wf-1',
      definition: def,
      triggerData: { items: ['a', 'b', 'c'] },
    });

    expect(publishIterationStarted).toHaveBeenCalledTimes(3);
    expect(publishIterationCompleted).toHaveBeenCalledTimes(3);
    publishIterationStarted.mock.calls.forEach((call, i) => {
      const args = call[0];
      expect(args.executionId).toBe('parent-exec');
      expect(args.nodeId).toBe('iter1');
      expect(args.iterationIndex).toBe(i);
      expect(args.iterationTotal).toBe(3);
      expect(args.childExecutionId).toMatch(/^child-exec-/);
    });
  });

  it('should fail the iterator step (and parent) when an iteration body fails by default', async () => {
    bodyExecutor.execute.mockImplementationOnce(async () => ({ data: { ok: 1 } }));
    bodyExecutor.execute.mockImplementationOnce(async () => {
      throw new Error('body blew up on iteration 1');
    });
    bodyExecutor.execute.mockImplementationOnce(async () => ({ data: { ok: 3 } }));

    const def: WorkflowDefinition = {
      nodes: [
        node('t1', 'manual-trigger'),
        node('iter1', 'iterator', 'iter1', { arrayPath: '{{t1.items}}' }),
        node('bodyA', 'body-action'),
      ],
      edges: [edge('e1', 't1', 'iter1'), edge('e2', 'iter1', 'bodyA', 'body')],
    };

    const result = await runner.run({
      executionId: 'parent-exec',
      workflowId: 'wf-1',
      definition: def,
      triggerData: { items: [1, 2, 3] },
    });

    expect(result.status).toBe('FAILED');
    expect(bodyExecutor.execute).toHaveBeenCalledTimes(2);
  });

  describe('continueOnError', () => {
    it('should keep iterating after a failed iteration when continueOnError is true and report partial counts', async () => {
      bodyExecutor.execute.mockImplementationOnce(async () => ({ data: { ok: 1 } }));
      bodyExecutor.execute.mockImplementationOnce(async () => {
        throw new Error('iteration 1 oops');
      });
      bodyExecutor.execute.mockImplementationOnce(async () => ({ data: { ok: 3 } }));

      const def: WorkflowDefinition = {
        nodes: [
          node('t1', 'manual-trigger'),
          node('iter1', 'iterator', 'iter1', {
            arrayPath: '{{t1.items}}',
            continueOnError: true,
          }),
          node('bodyA', 'body-action'),
        ],
        edges: [edge('e1', 't1', 'iter1'), edge('e2', 'iter1', 'bodyA', 'body')],
      };

      const result = await runner.run({
        executionId: 'parent-exec',
        workflowId: 'wf-1',
        definition: def,
        triggerData: { items: [1, 2, 3] },
      });

      expect(result.status).toBe('SUCCESS');
      expect(bodyExecutor.execute).toHaveBeenCalledTimes(3);
      const iterStep = steps.find(
        (s) => s.executionId === 'parent-exec' && s.nodeId === 'iter1' && s.status === 'SUCCESS',
      );
      expect(iterStep).toBeDefined();
      expect(iterStep?.outputData).toEqual({ total: 3, succeeded: 2, failed: 1 });
    });

    it('should still fire the done-handle node when continueOnError surfaced partial failures', async () => {
      bodyExecutor.execute.mockImplementationOnce(async () => ({ data: {} }));
      bodyExecutor.execute.mockImplementationOnce(async () => {
        throw new Error('boom');
      });

      const def: WorkflowDefinition = {
        nodes: [
          node('t1', 'manual-trigger'),
          node('iter1', 'iterator', 'iter1', {
            arrayPath: '{{t1.items}}',
            continueOnError: true,
          }),
          node('bodyA', 'body-action'),
          node('postX', 'post-action'),
        ],
        edges: [
          edge('e1', 't1', 'iter1'),
          edge('e2', 'iter1', 'bodyA', 'body'),
          edge('e3', 'iter1', 'postX', 'done'),
        ],
      };

      const result = await runner.run({
        executionId: 'parent-exec',
        workflowId: 'wf-1',
        definition: def,
        triggerData: { items: [1, 2] },
      });

      expect(result.status).toBe('SUCCESS');
      expect(postIteratorExecutor.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('maxItems', () => {
    it('should cap the iteration count at maxItems even when the resolved array is larger', async () => {
      const def: WorkflowDefinition = {
        nodes: [
          node('t1', 'manual-trigger'),
          node('iter1', 'iterator', 'iter1', {
            arrayPath: '{{t1.items}}',
            maxItems: 2,
          }),
          node('bodyA', 'body-action'),
        ],
        edges: [edge('e1', 't1', 'iter1'), edge('e2', 'iter1', 'bodyA', 'body')],
      };

      await runner.run({
        executionId: 'parent-exec',
        workflowId: 'wf-1',
        definition: def,
        triggerData: { items: [1, 2, 3, 4, 5] },
      });

      const children = workflowExecutions.filter((r) => r.parentExecutionId === 'parent-exec');
      expect(children).toHaveLength(2);
      expect(bodyExecutor.execute).toHaveBeenCalledTimes(2);
      const triggerData = children.map((c) => c.triggerData) as Array<{
        item: number;
        index: number;
        total: number;
      }>;
      // total reflects the capped count, not the original array length.
      expect(triggerData.every((td) => td.total === 2)).toBe(true);
    });
  });

  describe('recursion depth', () => {
    it('should fail with RecursionDepthExceededError when invoked beyond MAX_RECURSION_DEPTH', async () => {
      const def: WorkflowDefinition = {
        nodes: [node('t1', 'manual-trigger')],
        edges: [],
      };

      const result = await runner.run({
        executionId: 'parent-exec',
        workflowId: 'wf-1',
        definition: def,
        depth: 6,
      });

      expect(result.status).toBe('FAILED');
      expect(result.error).toMatch(/Recursion depth limit/);
    });
  });
});
