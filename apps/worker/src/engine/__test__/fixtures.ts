// Shared test fixtures for the WorkflowRunner spec suite. The runner's tests are
// split by behavior across several *.spec.ts files (step-resume, error-routing,
// templates, scope, sticky notes, and the core `run` block); they all build the
// runner the same way, so the mock factories and the Testing-module wiring live
// here and each spec calls `buildRunnerHarness()` in its own beforeEach.
import { Test, type TestingModule } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import type { INodeExecutor, NodeInput, NodeOutput, ExecutionContext } from '@tietide/sdk';
import { PrismaService } from '../../prisma/prisma.service';
import { NodeRegistry } from '../../nodes/registry';
import { ExecutionEventsService } from '../../events/execution-events.service';
import { WorkflowRunner } from '../workflow-runner';
import { IteratorExecutor } from '../iterator-executor';
import { SECRET_RESOLVER, type SecretResolver } from '../secret-resolver';
import { ENV_VAR_RESOLVER, type EnvVarResolver } from '../env-var-resolver';
import {
  CONNECTION_RESOLVER,
  type ConnectionResolver,
} from '../../connections/connection-resolver';

export interface ChildLoggerMock {
  warn: jest.Mock;
  info: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
  child: jest.Mock;
}

interface PinoLoggerMock {
  child: jest.Mock<ChildLoggerMock, [Record<string, unknown>]>;
}

export interface NestjsPinoLoggerMock {
  logger: PinoLoggerMock;
  setContext: jest.Mock;
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
  trace: jest.Mock;
  fatal: jest.Mock;
}

export function createLoggerMock(): { logger: NestjsPinoLoggerMock; child: ChildLoggerMock } {
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

export type CallableExecutor = INodeExecutor & {
  execute: jest.Mock<Promise<NodeOutput>, [NodeInput, ExecutionContext]>;
};

export const makeExecutor = (
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

export const node = (id: string, type: string, name = id) => ({
  id,
  type,
  name,
  position: { x: 0, y: 0 },
  config: {},
});

export const edge = (id: string, source: string, target: string, sourceHandle?: string) => ({
  id,
  source,
  target,
  ...(sourceHandle ? { sourceHandle } : {}),
});

export const errorEdge = (id: string, source: string, target: string) => ({
  id,
  source,
  target,
  kind: 'error' as const,
});

export interface PrismaStepMock {
  create: jest.Mock;
  update: jest.Mock;
  findMany: jest.Mock;
  deleteMany: jest.Mock;
}

export interface PrismaMock {
  executionStep: PrismaStepMock;
}

export interface EventsMock {
  publishStepStarted: jest.Mock;
  publishStepCompleted: jest.Mock;
  publishStepFailed: jest.Mock;
  publishStepSkipped: jest.Mock;
  publishExecutionCompleted: jest.Mock;
}

type EnvVarResolverMock = EnvVarResolver & {
  getEnvScope: jest.Mock;
  releaseExecution: jest.Mock;
};

type ConnectionResolverMock = ConnectionResolver & {
  getConnection: jest.Mock;
  markForRefresh: jest.Mock;
  releaseExecution: jest.Mock;
};

export interface RunnerHarness {
  runner: WorkflowRunner;
  registry: NodeRegistry;
  prisma: PrismaMock;
  secretResolver: SecretResolver;
  envVarResolver: EnvVarResolverMock;
  connectionResolver: ConnectionResolverMock;
  events: EventsMock;
  loggerMock: NestjsPinoLoggerMock;
  childLogger: ChildLoggerMock;
}

// Build a fresh WorkflowRunner with fully-mocked collaborators. Mirrors the
// original single-file beforeEach so every split spec gets identical wiring.
export async function buildRunnerHarness(): Promise<RunnerHarness> {
  const created = createLoggerMock();
  const loggerMock = created.logger;
  const childLogger = created.child;
  const registry = new NodeRegistry();

  const prisma: PrismaMock = {
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

  const secretResolver: SecretResolver = {
    getSecret: jest.fn(async () => 'resolved-secret'),
    releaseExecution: jest.fn(),
  };

  const envVarResolver = {
    getEnvScope: jest.fn(async () => new Map<string, string>()),
    releaseExecution: jest.fn(),
  } as unknown as EnvVarResolverMock;

  const connectionResolver = {
    getConnection: jest.fn(async () => ({
      id: 'conn-default',
      type: 'OAUTH2',
      provider: 'google',
      config: {},
    })),
    markForRefresh: jest.fn(async () => undefined),
    releaseExecution: jest.fn(),
  } as unknown as ConnectionResolverMock;

  const events: EventsMock = {
    publishStepStarted: jest.fn(async () => undefined),
    publishStepCompleted: jest.fn(async () => undefined),
    publishStepFailed: jest.fn(async () => undefined),
    publishStepSkipped: jest.fn(async () => undefined),
    publishExecutionCompleted: jest.fn(async () => undefined),
  };

  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      WorkflowRunner,
      IteratorExecutor,
      { provide: NodeRegistry, useValue: registry },
      { provide: PrismaService, useValue: prisma },
      { provide: SECRET_RESOLVER, useValue: secretResolver },
      { provide: ENV_VAR_RESOLVER, useValue: envVarResolver },
      { provide: CONNECTION_RESOLVER, useValue: connectionResolver },
      { provide: ExecutionEventsService, useValue: events },
      { provide: PinoLogger, useValue: loggerMock },
    ],
  }).compile();

  const runner = moduleRef.get(WorkflowRunner);

  return {
    runner,
    registry,
    prisma,
    secretResolver,
    envVarResolver,
    connectionResolver,
    events,
    loggerMock,
    childLogger,
  };
}
