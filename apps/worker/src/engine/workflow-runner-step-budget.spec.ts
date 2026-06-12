// W5.16 — engine-enforced per-execution step budget. MAX_RECURSION_DEPTH (5) and
// the per-iterator item cap (1000) compose multiplicatively, so a tiny saved
// definition that nests an iterator can fan out to ~1000^5 child executions/steps
// from one top-level run — a DB-row flood + worker-slot saturation DoS reachable by
// any authenticated user. The runner must enforce a single GLOBAL budget shared
// across the whole parent->child execution tree and abort with a non-retryable
// structural error once it is exhausted, independent of depth and the per-iterator
// cap.
//
// This spec drives the iterator fan-out vector through the full WorkflowRunner +
// IteratorExecutor path against in-memory Prisma doubles (mirrors
// iterator-integration.spec.ts), with the budget set low so a single iterator's
// body run trips it.

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
import { setMaxExecutionSteps } from './step-budget';

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

describe('WorkflowRunner — per-execution step budget (W5.16)', () => {
  let runner: WorkflowRunner;
  let registry: NodeRegistry;
  let bodyExecutor: INodeExecutor & {
    execute: jest.Mock<Promise<NodeOutput>, [NodeInput, ExecutionContext]>;
  };

  afterEach(() => {
    setMaxExecutionSteps(undefined);
  });

  beforeEach(async () => {
    const workflowExecutions: Array<Record<string, unknown>> = [];
    const steps: Array<Record<string, unknown>> = [];
    let weId = 0;
    let stepId = 0;

    const weCreate = jest.fn(
      async ({ data, select }: { data: Record<string, unknown>; select?: object }) => {
        const id = `child-exec-${++weId}`;
        const row = { id, ...data, finishedAt: null, error: null };
        workflowExecutions.push(row);
        return select ? { id } : row;
      },
    );
    const weFindFirst = jest.fn(
      async ({
        where,
        select,
      }: {
        where: { workflowId?: string; idempotencyKey?: string };
        select?: object;
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
    const weUpdate = jest.fn(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = workflowExecutions.find((r) => r.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      },
    );
    const stepCreate = jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const id = `step-${++stepId}`;
      const row = { id, ...data };
      steps.push(row);
      return row;
    });
    const stepUpdate = jest.fn(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = steps.find((r) => r.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      },
    );

    const prisma = {
      workflowExecution: { create: weCreate, update: weUpdate, findFirst: weFindFirst },
      executionStep: {
        create: stepCreate,
        update: stepUpdate,
        findMany: jest.fn(async () => []),
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
    };

    const secretResolver: SecretResolver = {
      getSecret: jest.fn(async () => 'secret'),
      releaseExecution: jest.fn(),
    };
    const envVarResolver = {
      getEnvScope: jest.fn(async () => new Map<string, string>()),
      releaseExecution: jest.fn(),
    } as unknown as EnvVarResolver;
    const connectionResolver = {
      getConnection: jest.fn(),
      markForRefresh: jest.fn(),
      releaseExecution: jest.fn(),
    } as unknown as ConnectionResolver;
    const events = {
      publishStepStarted: jest.fn(async () => undefined),
      publishStepCompleted: jest.fn(async () => undefined),
      publishStepFailed: jest.fn(async () => undefined),
      publishStepSkipped: jest.fn(async () => undefined),
      publishIterationStarted: jest.fn(async () => undefined),
      publishIterationCompleted: jest.fn(async () => undefined),
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
      execute: jest.fn<Promise<NodeOutput>, [NodeInput, ExecutionContext]>(async () => ({
        data: { ok: true },
      })),
    };
    registry.register(bodyExecutor);
  });

  it('should ABORT a runaway iterator fan-out once the global step budget is exhausted', async () => {
    // Budget of 5: the parent processes trigger + iterator, then each iteration's
    // body node consumes a unit. With 100 items the body run trips the budget well
    // before completing — without the guard all 100 children would be created.
    setMaxExecutionSteps(5);

    const def: WorkflowDefinition = {
      nodes: [
        node('t1', 'manual-trigger'),
        node('iter1', 'iterator', 'iter1', { arrayPath: '{{t1.items}}', continueOnError: true }),
        node('bodyA', 'body-action'),
      ],
      edges: [edge('e1', 't1', 'iter1'), edge('e2', 'iter1', 'bodyA', 'body')],
    };

    const result = await runner.run({
      executionId: 'parent-exec',
      workflowId: 'wf-1',
      definition: def,
      triggerData: { items: Array.from({ length: 100 }, (_, i) => i) },
    });

    expect(result.status).toBe('FAILED');
    expect(result.error).toMatch(/step budget/i);
    // Structural overflow — a retry of the same oversized definition will re-trip it.
    expect(result.retryable).toBe(false);
    // The guard stops the fan-out: the body did NOT run for all 100 items.
    expect(bodyExecutor.execute.mock.calls.length).toBeLessThan(100);
  });

  it('should let a normal small workflow run to completion under the budget', async () => {
    setMaxExecutionSteps(50_000);

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
    expect(bodyExecutor.execute).toHaveBeenCalledTimes(3);
  });
});
