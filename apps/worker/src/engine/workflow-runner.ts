import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

type PinoChildLogger = ReturnType<PinoLogger['logger']['child']>;
import {
  ITERATOR_MAX_ITEMS_DEFAULT,
  NODE_CATALOG,
  NodeCategory,
  NodeType,
  RESERVED_CONFIG_KEYS,
  iteratorConfigSchema,
  resolveTemplate,
  type EnvScope,
  type WorkflowDefinition,
  type WorkflowNode,
  type WorkflowEdge,
} from '@tietide/shared';
import type { ExecutionContext, Logger as SdkLogger, NodeInput, NodeOutput } from '@tietide/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { NodeRegistry } from '../nodes/registry';
import { ExecutionEventsService } from '../events/execution-events.service';
import { SECRET_RESOLVER, type SecretResolver } from './secret-resolver';
import { ENV_VAR_RESOLVER, type EnvVarResolver } from './env-var-resolver';
import { CONNECTION_RESOLVER, type ConnectionResolver } from '../connections/connection-resolver';
import { CircularDependencyError, topologicalSort } from './topological-sort';
import { buildBodyDefinition, extractBodySubgraph, validateBodySubgraph } from './iterator-runner';
import { ITERATOR_NODE_TYPE } from '../nodes/logic/iterator';

export const MAX_RECURSION_DEPTH = 5;

export class RecursionDepthExceededError extends Error {
  constructor(depth: number) {
    super(
      `Recursion depth limit (${MAX_RECURSION_DEPTH}) exceeded at depth ${depth}. ` +
        `Iterator and subworkflow nodes may not nest more than ${MAX_RECURSION_DEPTH} levels deep.`,
    );
    this.name = 'RecursionDepthExceededError';
  }
}

function extractErrorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

/**
 * Drop editor-only reserved keys (e.g. the data-pill `__pillSample`) from a node
 * config so they never reach an executor's params. Returns the original object
 * untouched when no reserved key is present (avoids needless allocation).
 */
function stripReservedConfigKeys(config: Record<string, unknown>): Record<string, unknown> {
  if (!RESERVED_CONFIG_KEYS.some((key) => key in config)) return config;
  const sanitized: Record<string, unknown> = { ...config };
  for (const key of RESERVED_CONFIG_KEYS) {
    delete sanitized[key];
  }
  return sanitized;
}

export interface RunArgs {
  executionId: string;
  workflowId: string;
  definition: WorkflowDefinition;
  triggerData?: Record<string, unknown>;
  isDryRun?: boolean;
  // Identity of the WorkflowExecution that spawned this run (iterator/subworkflow).
  // null/undefined for top-level runs started by API/cron/webhook.
  parentExecutionId?: string;
  // Depth in the parent->child execution tree. 0 for top-level. The runner
  // propagates depth+1 to any iterator/subworkflow children it spawns.
  depth?: number;
  // Originating API X-Request-Id, propagated via BullMQ job metadata.
  // Bound on a pino child logger so step-level logs can be correlated back
  // to the originating request (CLAUDE.md §11).
  requestId?: string;
}

export interface RunResult {
  status: 'SUCCESS' | 'FAILED';
  error?: string;
  failedNodeId?: string;
}

@Injectable()
export class WorkflowRunner {
  constructor(
    private readonly registry: NodeRegistry,
    private readonly prisma: PrismaService,
    @Inject(SECRET_RESOLVER) private readonly secretResolver: SecretResolver,
    @Inject(ENV_VAR_RESOLVER) private readonly envVarResolver: EnvVarResolver,
    @Inject(CONNECTION_RESOLVER) private readonly connectionResolver: ConnectionResolver,
    private readonly events: ExecutionEventsService,
    private readonly log: PinoLogger,
  ) {
    this.log.setContext(WorkflowRunner.name);
  }

  // Build a pino child logger bound to this run's correlation fields. The
  // requestId propagates from the BullMQ job payload (Issue #162) and is
  // attached here once so every step-level log line within this run carries
  // it without threading the value through every helper signature.
  private buildRunLogger(args: { requestId: string | undefined }): PinoChildLogger {
    const bindings: Record<string, unknown> = { runner: 'WorkflowRunner' };
    if (args.requestId) bindings.requestId = args.requestId;
    return this.log.logger.child(bindings);
  }

  async run(args: RunArgs): Promise<RunResult> {
    try {
      return await this.runInner(args);
    } finally {
      this.secretResolver.releaseExecution(args.executionId);
      this.envVarResolver.releaseExecution(args.executionId);
      this.connectionResolver.releaseExecution(args.executionId);
    }
  }

  private async runInner(args: RunArgs): Promise<RunResult> {
    const { executionId, workflowId, definition, triggerData, isDryRun = false } = args;
    const depth = args.depth ?? 0;
    const runLog = this.buildRunLogger({ requestId: args.requestId });

    if (depth > MAX_RECURSION_DEPTH) {
      return { status: 'FAILED', error: new RecursionDepthExceededError(depth).message };
    }

    // Sticky notes are non-executing canvas annotations: no executor, no
    // ExecutionStep, no events. Drop them (and any edges incident on them)
    // from a working copy of the definition before topological sort so they
    // do not count as extra in-degree-zero roots and never enter the rest of
    // the pipeline.
    const stickyIds = new Set(
      definition.nodes.filter((n) => n.type === NodeType.STICKY).map((n) => n.id),
    );
    const executableDefinition: WorkflowDefinition =
      stickyIds.size > 0
        ? {
            nodes: definition.nodes.filter((n) => !stickyIds.has(n.id)),
            edges: definition.edges.filter(
              (e) => !stickyIds.has(e.source) && !stickyIds.has(e.target),
            ),
          }
        : definition;

    let order: string[];
    try {
      order = topologicalSort(executableDefinition);
    } catch (err) {
      if (err instanceof CircularDependencyError) {
        return { status: 'FAILED', error: err.message };
      }
      return { status: 'FAILED', error: (err as Error).message };
    }

    // Load merged env-var scope once per execution. The resolver caches by
    // executionId so any later call hits the cache; we fetch eagerly so a
    // missing-execution failure surfaces before nodes start running.
    const envScope = await this.envVarResolver.getEnvScope(executionId);

    for (const nodeId of order) {
      const n = executableDefinition.nodes.find((x) => x.id === nodeId)!;
      if (!this.registry.has(n.type)) {
        return { status: 'FAILED', error: `No executor registered for node type "${n.type}"` };
      }
    }

    const nodeById = new Map(executableDefinition.nodes.map((n) => [n.id, n]));
    const incomingEdges = new Map<string, WorkflowEdge[]>();
    const outgoingEdges = new Map<string, WorkflowEdge[]>();
    for (const n of executableDefinition.nodes) {
      incomingEdges.set(n.id, []);
      outgoingEdges.set(n.id, []);
    }
    for (const e of executableDefinition.edges) {
      incomingEdges.get(e.target)!.push(e);
      outgoingEdges.get(e.source)!.push(e);
    }

    const outputs = new Map<string, NodeOutput>();
    const reachable = new Set<string>([order[0]]);
    const executionOrder: string[] = [];
    let failure: { nodeId: string; error: string } | null = null;

    for (const nodeId of order) {
      const n = nodeById.get(nodeId)!;

      if (failure || !reachable.has(nodeId)) {
        await this.recordCancelled(executionId, n);
        continue;
      }

      const input = this.buildInput(
        n,
        executionOrder,
        incomingEdges.get(n.id) ?? [],
        outputs,
        triggerData,
      );

      if (n.skipped === true && !this.isTriggerNode(n)) {
        await this.recordSkipped(executionId, n, input.data);
        const passthroughOutput: NodeOutput = { data: input.data };
        outputs.set(n.id, passthroughOutput);
        executionOrder.push(n.id);
        this.propagateReachability(
          passthroughOutput,
          outgoingEdges.get(n.id) ?? [],
          reachable,
          'success',
        );
        continue;
      }

      if (n.type === ITERATOR_NODE_TYPE) {
        const iterResult = await this.runIteratorNode({
          iteratorNode: n,
          rootDefinition: definition,
          parentExecutionId: executionId,
          workflowId,
          depth,
          triggerData,
          incoming: incomingEdges.get(n.id) ?? [],
          outgoing: outgoingEdges.get(n.id) ?? [],
          executionOrder,
          outputs,
          reachable,
          isDryRun,
          envScope,
          requestId: args.requestId,
        });
        if (iterResult.status === 'FAILED') {
          failure = { nodeId: n.id, error: iterResult.error ?? 'Iterator failed' };
        }
        continue;
      }

      const startedAt = new Date();
      const step = await this.prisma.executionStep.create({
        data: {
          executionId,
          nodeId: n.id,
          nodeType: n.type,
          nodeName: n.name,
          status: 'RUNNING',
          startedAt,
        },
      });
      await this.events.publishStepStarted({
        executionId,
        nodeId: n.id,
        nodeType: n.type,
        startedAt,
      });

      const started = Date.now();
      try {
        const executor = this.registry.resolve(n.type)!;
        const ctx = this.buildContext(executionId, workflowId, n.id, isDryRun, depth);
        const resolvedInput = this.resolveInputTemplates(input, executionOrder, outputs, envScope);
        const output = await executor.execute(resolvedInput, ctx);
        const durationMs = Date.now() - started;
        const finishedAt = new Date();

        outputs.set(n.id, output);
        executionOrder.push(n.id);

        await this.prisma.executionStep.update({
          where: { id: step.id },
          data: {
            nodeId: n.id,
            status: 'SUCCESS',
            inputData: input.data as object,
            outputData: output.data as object,
            finishedAt,
            durationMs,
          },
        });
        await this.events.publishStepCompleted({
          executionId,
          nodeId: n.id,
          nodeType: n.type,
          startedAt,
          finishedAt,
          durationMs,
          input: input.data,
          output: output.data,
        });

        this.propagateReachability(output, outgoingEdges.get(n.id) ?? [], reachable, 'success');
      } catch (err) {
        const e = err as Error & {
          stack?: string;
          name?: string;
          cause?: unknown;
          response?: unknown;
        };
        const message = e.message ?? 'Unknown error';
        const durationMs = Date.now() - started;
        const finishedAt = new Date();
        runLog.warn(
          {
            executionId,
            workflowId,
            nodeId: n.id,
            nodeType: n.type,
            errName: e.name,
            errStack: e.stack,
            errCause:
              e.cause instanceof Error
                ? { name: e.cause.name, message: e.cause.message }
                : (e.cause ?? null),
            errResponse: e.response ?? null,
          },
          `Node failed: ${message}`,
        );
        await this.prisma.executionStep.update({
          where: { id: step.id },
          data: {
            nodeId: n.id,
            status: 'FAILED',
            inputData: input.data as object,
            error: message,
            finishedAt,
            durationMs,
          },
        });
        await this.events.publishStepFailed({
          executionId,
          nodeId: n.id,
          nodeType: n.type,
          startedAt,
          finishedAt,
          durationMs,
          input: input.data,
          error: { message },
        });

        const outgoing = outgoingEdges.get(n.id) ?? [];
        const hasErrorEdge = outgoing.some((e) => e.kind === 'error');
        if (hasErrorEdge) {
          const errorPayload: { message: string; code?: string; nodeId: string } = {
            message,
            nodeId: n.id,
          };
          const code = extractErrorCode(err);
          if (code !== undefined) errorPayload.code = code;
          const errorOutput: NodeOutput = { data: { error: errorPayload } };
          outputs.set(n.id, errorOutput);
          executionOrder.push(n.id);
          this.propagateReachability(errorOutput, outgoing, reachable, 'error');
        } else {
          failure = { nodeId: n.id, error: message };
        }
      }
    }

    if (failure) {
      return { status: 'FAILED', error: failure.error, failedNodeId: failure.nodeId };
    }
    return { status: 'SUCCESS' };
  }

  private resolveInputTemplates(
    input: NodeInput,
    executionOrder: string[],
    outputs: Map<string, NodeOutput>,
    envScope: EnvScope,
  ): NodeInput {
    const scope: Record<string, unknown> = {};
    for (const id of executionOrder) {
      const out = outputs.get(id);
      if (out) scope[id] = out.data;
    }
    const resolvedParams = resolveTemplate(input.params, scope, envScope) as Record<
      string,
      unknown
    >;
    return { ...input, params: resolvedParams };
  }

  private buildInput(
    n: WorkflowNode,
    executionOrder: string[],
    incoming: WorkflowEdge[],
    outputs: Map<string, NodeOutput>,
    triggerData?: Record<string, unknown>,
  ) {
    let data: Record<string, unknown> = {};
    if (incoming.length === 0) {
      data = triggerData ?? {};
    } else {
      const executedPredecessors = executionOrder.filter((id) =>
        incoming.some((e) => e.source === id),
      );
      const last = executedPredecessors[executedPredecessors.length - 1];
      if (last) {
        data = outputs.get(last)?.data ?? {};
      }
    }
    const rawConnectionId = (n.config as { connectionId?: unknown }).connectionId;
    const connectionId = typeof rawConnectionId === 'string' ? rawConnectionId : undefined;
    // Reserved keys (e.g. the data-pill `__pillSample`) live on the node config
    // for the editor only — strip them so they never reach the executor's params.
    const params = stripReservedConfigKeys(n.config);
    return connectionId ? { data, params, connectionId } : { data, params };
  }

  private propagateReachability(
    output: NodeOutput,
    outgoing: WorkflowEdge[],
    reachable: Set<string>,
    outcome: 'success' | 'error',
  ): void {
    const branch = output.metadata?.branch as string | undefined;
    for (const e of outgoing) {
      const edgeKind = e.kind ?? 'success';
      if (edgeKind !== outcome) continue;
      if (outcome === 'error') {
        reachable.add(e.target);
        continue;
      }
      if (e.sourceHandle === undefined) {
        reachable.add(e.target);
      } else if (branch !== undefined && e.sourceHandle === branch) {
        reachable.add(e.target);
      }
    }
  }

  private async recordCancelled(executionId: string, n: WorkflowNode): Promise<void> {
    const step = await this.prisma.executionStep.create({
      data: {
        executionId,
        nodeId: n.id,
        nodeType: n.type,
        nodeName: n.name,
        status: 'CANCELLED',
      },
    });
    await this.prisma.executionStep.update({
      where: { id: step.id },
      data: { nodeId: n.id, status: 'CANCELLED' },
    });
  }

  private isTriggerNode(n: WorkflowNode): boolean {
    return NODE_CATALOG.find((d) => d.type === n.type)?.category === NodeCategory.TRIGGER;
  }

  private async recordSkipped(
    executionId: string,
    n: WorkflowNode,
    forwardedInput: Record<string, unknown>,
  ): Promise<void> {
    const startedAt = new Date();
    const step = await this.prisma.executionStep.create({
      data: {
        executionId,
        nodeId: n.id,
        nodeType: n.type,
        nodeName: n.name,
        status: 'SKIPPED',
        startedAt,
      },
    });
    const finishedAt = new Date();
    const passthroughOutput = { skipped: true, passthrough: forwardedInput };
    await this.prisma.executionStep.update({
      where: { id: step.id },
      data: {
        nodeId: n.id,
        status: 'SKIPPED',
        inputData: forwardedInput as object,
        outputData: passthroughOutput as object,
        finishedAt,
        durationMs: 0,
      },
    });
    await this.events.publishStepSkipped({
      executionId,
      nodeId: n.id,
      nodeType: n.type,
      startedAt,
      finishedAt,
      durationMs: 0,
      input: forwardedInput,
      output: passthroughOutput,
    });
  }

  private async runIteratorNode(opts: {
    iteratorNode: WorkflowNode;
    rootDefinition: WorkflowDefinition;
    parentExecutionId: string;
    workflowId: string;
    depth: number;
    triggerData: Record<string, unknown> | undefined;
    incoming: WorkflowEdge[];
    outgoing: WorkflowEdge[];
    executionOrder: string[];
    outputs: Map<string, NodeOutput>;
    reachable: Set<string>;
    isDryRun: boolean;
    envScope: EnvScope;
    requestId: string | undefined;
  }): Promise<{ status: 'SUCCESS' | 'FAILED'; error?: string }> {
    const {
      iteratorNode: n,
      rootDefinition,
      parentExecutionId,
      workflowId,
      depth,
      triggerData,
      incoming,
      outgoing,
      executionOrder,
      outputs,
      reachable,
      isDryRun,
      envScope,
      requestId,
    } = opts;

    const startedAt = new Date();
    const step = await this.prisma.executionStep.create({
      data: {
        executionId: parentExecutionId,
        nodeId: n.id,
        nodeType: n.type,
        nodeName: n.name,
        status: 'RUNNING',
        startedAt,
      },
    });
    await this.events.publishStepStarted({
      executionId: parentExecutionId,
      nodeId: n.id,
      nodeType: n.type,
      startedAt,
    });

    const builtInput = this.buildInput(n, executionOrder, incoming, outputs, triggerData);

    const fail = async (error: string): Promise<{ status: 'FAILED'; error: string }> => {
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      await this.prisma.executionStep.update({
        where: { id: step.id },
        data: {
          nodeId: n.id,
          status: 'FAILED',
          inputData: builtInput.data as object,
          error,
          finishedAt,
          durationMs,
        },
      });
      await this.events.publishStepFailed({
        executionId: parentExecutionId,
        nodeId: n.id,
        nodeType: n.type,
        startedAt,
        finishedAt,
        durationMs,
        input: builtInput.data,
        error: { message: error },
      });
      return { status: 'FAILED', error };
    };

    let parsedConfig: ReturnType<typeof iteratorConfigSchema.parse>;
    try {
      parsedConfig = iteratorConfigSchema.parse(n.config);
    } catch (err) {
      return await fail(`Invalid iterator config: ${(err as Error).message}`);
    }

    let resolvedItems: unknown;
    try {
      const resolvedInput = this.resolveInputTemplates(
        builtInput,
        executionOrder,
        outputs,
        envScope,
      );
      resolvedItems = (resolvedInput.params as Record<string, unknown>).arrayPath;
    } catch (err) {
      return await fail(`Failed to resolve iterator arrayPath: ${(err as Error).message}`);
    }

    if (!Array.isArray(resolvedItems)) {
      return await fail(
        `Iterator arrayPath did not resolve to an array (got ${typeof resolvedItems}). ` +
          `Use a data pill that points at an array, e.g. {{http_1.response.body.items}}.`,
      );
    }

    const items = resolvedItems;
    const cap = parsedConfig.maxItems ?? ITERATOR_MAX_ITEMS_DEFAULT;
    const total = Math.min(items.length, cap);

    let bodyInfo: ReturnType<typeof extractBodySubgraph>;
    try {
      bodyInfo = extractBodySubgraph(rootDefinition, n.id);
      validateBodySubgraph(rootDefinition, n.id, bodyInfo.bodyNodeIds);
    } catch (err) {
      return await fail((err as Error).message);
    }

    let succeeded = 0;
    let failed = 0;

    for (let index = 0; index < total; index++) {
      const item = items[index];
      const iterStartedAt = new Date();
      const child = await this.prisma.workflowExecution.create({
        data: {
          workflowId,
          parentExecutionId,
          status: 'RUNNING',
          triggerType: 'iterator',
          triggerData: { item, index, total } as object,
          isDryRun,
          startedAt: iterStartedAt,
        },
        select: { id: true },
      });
      const childExecutionId = child.id;

      await this.events.publishIterationStarted({
        executionId: parentExecutionId,
        nodeId: n.id,
        iterationIndex: index,
        iterationTotal: total,
        childExecutionId,
        startedAt: iterStartedAt,
      });

      let iterStatus: 'SUCCESS' | 'FAILED' = 'SUCCESS';
      let iterError: string | undefined;

      if (bodyInfo.bodyNodeIds.size === 0) {
        // No body — nothing to run for this iteration. The child execution
        // remains a record of the iteration scope for traceability.
        iterStatus = 'SUCCESS';
      } else {
        const bodyDef = buildBodyDefinition({
          definition: rootDefinition,
          iteratorNodeId: n.id,
          bodyNodeIds: bodyInfo.bodyNodeIds,
          bodyEntryNodeIds: bodyInfo.bodyEntryNodeIds,
          syntheticTriggerId: n.id,
        });
        const childResult = await this.run({
          executionId: childExecutionId,
          workflowId,
          definition: bodyDef,
          triggerData: { item, index, total },
          isDryRun,
          parentExecutionId,
          depth: depth + 1,
          requestId,
        });
        iterStatus = childResult.status;
        iterError = childResult.error;
      }

      const iterFinishedAt = new Date();
      const iterDuration = iterFinishedAt.getTime() - iterStartedAt.getTime();

      await this.prisma.workflowExecution.update({
        where: { id: childExecutionId },
        data: {
          status: iterStatus,
          finishedAt: iterFinishedAt,
          error: iterError ?? null,
        },
      });
      await this.events.publishIterationCompleted({
        executionId: parentExecutionId,
        nodeId: n.id,
        iterationIndex: index,
        iterationTotal: total,
        childExecutionId,
        startedAt: iterStartedAt,
        finishedAt: iterFinishedAt,
        durationMs: iterDuration,
        status: iterStatus,
        ...(iterError ? { error: { message: iterError } } : {}),
      });

      if (iterStatus === 'SUCCESS') {
        succeeded += 1;
      } else {
        failed += 1;
        if (!parsedConfig.continueOnError) break;
      }
    }

    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();

    if (failed > 0 && !parsedConfig.continueOnError) {
      const message = `Iterator failed: iteration ${succeeded} of ${total} reported FAILED`;
      await this.prisma.executionStep.update({
        where: { id: step.id },
        data: {
          nodeId: n.id,
          status: 'FAILED',
          inputData: builtInput.data as object,
          error: message,
          finishedAt,
          durationMs,
        },
      });
      await this.events.publishStepFailed({
        executionId: parentExecutionId,
        nodeId: n.id,
        nodeType: n.type,
        startedAt,
        finishedAt,
        durationMs,
        input: builtInput.data,
        error: { message },
      });
      return { status: 'FAILED', error: message };
    }

    const iteratorOutputData = { total, succeeded, failed };
    const iteratorOutput: NodeOutput = {
      data: iteratorOutputData,
      // 'done' branch: only edges leaving the iterator's `done` source-handle
      // propagate. Body-handle edges have already been consumed via child
      // executions and must NOT fire again in the parent loop.
      metadata: { branch: 'done' },
    };

    await this.prisma.executionStep.update({
      where: { id: step.id },
      data: {
        nodeId: n.id,
        status: 'SUCCESS',
        inputData: builtInput.data as object,
        outputData: iteratorOutputData as object,
        finishedAt,
        durationMs,
      },
    });
    await this.events.publishStepCompleted({
      executionId: parentExecutionId,
      nodeId: n.id,
      nodeType: n.type,
      startedAt,
      finishedAt,
      durationMs,
      input: builtInput.data,
      output: iteratorOutputData,
    });

    outputs.set(n.id, iteratorOutput);
    executionOrder.push(n.id);
    this.propagateReachability(iteratorOutput, outgoing, reachable, 'success');

    return { status: 'SUCCESS' };
  }

  private buildContext(
    executionId: string,
    workflowId: string,
    nodeId: string,
    isDryRun: boolean,
    depth: number,
  ): ExecutionContext {
    const secrets = this.secretResolver;
    const connections = this.connectionResolver;
    const logger: SdkLogger = {
      info: (msg, ctx) => this.log.info({ nodeId, ctx }, msg),
      warn: (msg, ctx) => this.log.warn({ nodeId, ctx }, msg),
      error: (msg, ctx) => this.log.error({ nodeId, ctx }, msg),
      debug: (msg, ctx) => this.log.debug({ nodeId, ctx }, msg),
    };
    return {
      executionId,
      workflowId,
      nodeId,
      logger,
      isDryRun,
      depth,
      getSecret: (name: string) => secrets.getSecret(executionId, name),
      getConnection: <TConfig = Record<string, unknown>>(connectionId: string) =>
        connections.getConnection<TConfig>(executionId, connectionId),
      markConnectionForRefresh: (connectionId: string) =>
        connections.markForRefresh(executionId, connectionId),
      refreshConnection: <TConfig = Record<string, unknown>>(connectionId: string) =>
        connections.refreshConnection<TConfig>(executionId, connectionId),
    };
  }
}
