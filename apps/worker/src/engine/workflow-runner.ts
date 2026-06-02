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
import { isUniqueViolation } from '../common/prisma-error';

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
  // Whether re-running this execution could plausibly succeed. A node-level
  // runtime failure (a flaky HTTP call, a transient DB error) is retryable;
  // a structural defect (unknown node type, a cycle, the recursion limit) will
  // always fail, so retrying is pointless. EngineService uses this to decide
  // whether to surface the failure to BullMQ for a retry (W1.8).
  retryable?: boolean;
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
      return {
        status: 'FAILED',
        error: new RecursionDepthExceededError(depth).message,
        retryable: false,
      };
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
        return { status: 'FAILED', error: err.message, retryable: false };
      }
      return { status: 'FAILED', error: (err as Error).message, retryable: false };
    }

    // Load merged env-var scope once per execution. The resolver caches by
    // executionId so any later call hits the cache; we fetch eagerly so a
    // missing-execution failure surfaces before nodes start running.
    const envScope = await this.envVarResolver.getEnvScope(executionId);

    for (const nodeId of order) {
      const n = executableDefinition.nodes.find((x) => x.id === nodeId)!;
      if (!this.registry.has(n.type)) {
        return {
          status: 'FAILED',
          error: `No executor registered for node type "${n.type}"`,
          retryable: false,
        };
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

    // Step-level resume (W1.8): a BullMQ retry re-processes the SAME executionId.
    // Reuse the recorded output of any side-effecting ACTION node that already
    // SUCCEEDED so the retry does not re-fire its external side effect; every
    // other node (pure logic / triggers, and the node that failed) is re-run.
    const reusable = await this.loadResumableOutputs(executionId, nodeById);

    const outputs = new Map<string, NodeOutput>();
    const reachable = new Set<string>([order[0]]);
    const executionOrder: string[] = [];
    // Final recorded status per node, so an unreachable node can tell WHY it was
    // not run (a conditional branched around it = SKIPPED, vs an upstream failure
    // abandoned the path = CANCELLED) by inspecting its predecessors (W3.12).
    const statusByNode = new Map<string, string>();
    let failure: { nodeId: string; error: string } | null = null;

    for (const nodeId of order) {
      const n = nodeById.get(nodeId)!;

      // A hard failure with no error-handler aborts the rest of the run: every
      // remaining node is CANCELLED regardless of why it would not have run.
      if (failure) {
        await this.recordCancelled(executionId, n);
        statusByNode.set(n.id, 'CANCELLED');
        continue;
      }
      if (!reachable.has(nodeId)) {
        const reason = this.classifyUnreached(incomingEdges.get(n.id) ?? [], statusByNode);
        if (reason === 'CANCELLED') {
          await this.recordCancelled(executionId, n);
          statusByNode.set(n.id, 'CANCELLED');
        } else {
          await this.recordUnreachedSkipped(executionId, n);
          statusByNode.set(n.id, 'SKIPPED');
        }
        continue;
      }

      // Resume: this side-effecting action already SUCCEEDED on a prior attempt.
      // Restore its recorded output and routing instead of re-executing it, so the
      // retry does not re-fire the side effect. Actions route via plain 'success'
      // (they never set metadata.branch), so reachability stays faithful (W1.8).
      const reusedData = reusable.get(n.id);
      if (reusedData !== undefined) {
        const reusedOutput: NodeOutput = { data: reusedData };
        outputs.set(n.id, reusedOutput);
        executionOrder.push(n.id);
        statusByNode.set(n.id, 'SUCCESS');
        this.propagateReachability(
          reusedOutput,
          outgoingEdges.get(n.id) ?? [],
          reachable,
          'success',
        );
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
        statusByNode.set(n.id, 'SKIPPED');
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
        statusByNode.set(n.id, iterResult.status);
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
        const ctx = this.buildContext(
          executionId,
          workflowId,
          n.id,
          isDryRun,
          depth,
          args.requestId,
        );
        const resolvedInput = this.resolveInputTemplates(input, executionOrder, outputs, envScope);
        const output = await executor.execute(resolvedInput, ctx);
        const durationMs = Date.now() - started;
        const finishedAt = new Date();

        outputs.set(n.id, output);
        executionOrder.push(n.id);
        statusByNode.set(n.id, 'SUCCESS');

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
        statusByNode.set(n.id, 'FAILED');
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
      // A node threw at runtime — retryable (a flaky dependency may recover). The
      // step-level resume above means a BullMQ retry won't re-fire nodes that
      // already succeeded, so re-running this execution is safe.
      return {
        status: 'FAILED',
        error: failure.error,
        failedNodeId: failure.nodeId,
        retryable: true,
      };
    }
    return { status: 'SUCCESS' };
  }

  // Load the outputs that a re-run may reuse. On the first attempt there are no
  // prior steps and this is a no-op. On a retry (same executionId), the recorded
  // output of every side-effecting ACTION node that already SUCCEEDED is returned
  // for reuse, and all other prior step rows are dropped so the re-run records
  // fresh attempts (pure logic/trigger nodes and the failed node re-execute). Only
  // ACTION nodes are reused because they are the side-effecting ones and they route
  // via plain 'success' — logic nodes carry branch metadata that is not persisted,
  // so they must re-run to reproduce their routing (W1.8).
  private async loadResumableOutputs(
    executionId: string,
    nodeById: Map<string, WorkflowNode>,
  ): Promise<Map<string, Record<string, unknown>>> {
    const priorSteps = await this.prisma.executionStep.findMany({
      where: { executionId },
      select: { id: true, nodeId: true, status: true, outputData: true },
    });
    if (priorSteps.length === 0) return new Map();

    const reusable = new Map<string, Record<string, unknown>>();
    const keepStepIds: string[] = [];
    for (const step of priorSteps) {
      const node = nodeById.get(step.nodeId);
      if (
        step.status === 'SUCCESS' &&
        node !== undefined &&
        step.outputData != null &&
        this.isActionNode(node)
      ) {
        reusable.set(step.nodeId, step.outputData as Record<string, unknown>);
        keepStepIds.push(step.id);
      }
    }

    if (keepStepIds.length === 0) {
      await this.prisma.executionStep.deleteMany({ where: { executionId } });
    } else {
      await this.prisma.executionStep.deleteMany({
        where: { executionId, id: { notIn: keepStepIds } },
      });
    }

    return reusable;
  }

  private isActionNode(n: WorkflowNode): boolean {
    return this.registry.resolve(n.type)?.category === NodeCategory.ACTION;
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
    // Surface the same upstream scope that drove template resolution so executors
    // (e.g. the Code node's `$nodes`) can read sibling/ancestor outputs directly.
    return { ...input, params: resolvedParams, scope };
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
      // Only predecessors that actually produced an output (executed or
      // skipped-passthrough) feed this node; cancelled/unreached ones do not.
      const predecessorIds = executionOrder.filter(
        (id) => incoming.some((e) => e.source === id) && outputs.has(id),
      );
      // input.data is the flat output of the LAST executed predecessor (the
      // established passthrough contract). On fan-in, every predecessor's output
      // is still exposed to the executor via input.scope (the `$nodes` map) and
      // `{{nodeId.field}}` template refs, so no branch is lost — W3.10's goal,
      // now carried by scope rather than by overloading input.data (#260).
      const lastId = predecessorIds[predecessorIds.length - 1];
      data = lastId ? (outputs.get(lastId)?.data ?? {}) : {};
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

  // A node that will not run because an upstream failure abandoned its path. Recorded
  // in a single write — the status is terminal at creation, so the prior redundant
  // create-then-update-to-the-same-status pair is collapsed (W3.12).
  private async recordCancelled(executionId: string, n: WorkflowNode): Promise<void> {
    await this.prisma.executionStep.create({
      data: {
        executionId,
        nodeId: n.id,
        nodeType: n.type,
        nodeName: n.name,
        status: 'CANCELLED',
      },
    });
  }

  // A node that will not run because normal conditional control flow routed around
  // it (the branch it sits on was not selected). Distinct from CANCELLED, which
  // implies a failure aborted the path. Single terminal write.
  private async recordUnreachedSkipped(executionId: string, n: WorkflowNode): Promise<void> {
    await this.prisma.executionStep.create({
      data: {
        executionId,
        nodeId: n.id,
        nodeType: n.type,
        nodeName: n.name,
        status: 'SKIPPED',
      },
    });
  }

  // Classify why an unreachable node (with no global failure in effect) did not run:
  // SKIPPED when a conditional branched around it, CANCELLED when an upstream failure
  // or an un-fired error-handler edge abandoned its path. Predecessors are processed
  // earlier in topological order, so their final status is already known.
  private classifyUnreached(
    incoming: WorkflowEdge[],
    statusByNode: Map<string, string>,
  ): 'CANCELLED' | 'SKIPPED' {
    for (const e of incoming) {
      // An error-handler edge that did not fire (we are unreachable) means its source
      // did not route here — the handler is a contingency that was cancelled.
      if ((e.kind ?? 'success') === 'error') return 'CANCELLED';
      // A success edge that was not taken because its source failed/was cancelled
      // propagates the cancellation; a conditional that simply chose another branch
      // (source SUCCESS) or a skipped source leaves us SKIPPED.
      const sourceStatus = statusByNode.get(e.source);
      if (sourceStatus === 'FAILED' || sourceStatus === 'CANCELLED') return 'CANCELLED';
    }
    return 'SKIPPED';
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

      // Tie each iteration child to (parent execution, iterator node, index) so a
      // re-processed parent (e.g. a future BullMQ retry — see W1.8) reuses the
      // child it already ran instead of duplicating the iteration's side effects.
      // Scoped per workflow via the child's @@unique([workflowId, idempotencyKey]).
      const iterKey = `iterator:${parentExecutionId}:${n.id}:${index}`;
      const priorChild = await this.prisma.workflowExecution.findFirst({
        where: { workflowId, idempotencyKey: iterKey },
        select: { id: true, status: true },
      });
      if (priorChild?.status === 'SUCCESS') {
        // Already completed on a previous attempt — count it and skip re-running.
        succeeded += 1;
        continue;
      }

      const childExecutionId = priorChild
        ? priorChild.id // prior attempt created it but did not finish — re-run in place
        : await this.createIterationChild({
            workflowId,
            parentExecutionId,
            item,
            index,
            total,
            isDryRun,
            iterStartedAt,
            idempotencyKey: iterKey,
          });

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

  // Create one iteration's child execution, tolerating a concurrent attempt that
  // wins the unique-key race by reusing the row it created.
  private async createIterationChild(args: {
    workflowId: string;
    parentExecutionId: string;
    item: unknown;
    index: number;
    total: number;
    isDryRun: boolean;
    iterStartedAt: Date;
    idempotencyKey: string;
  }): Promise<string> {
    try {
      const child = await this.prisma.workflowExecution.create({
        data: {
          workflowId: args.workflowId,
          parentExecutionId: args.parentExecutionId,
          status: 'RUNNING',
          triggerType: 'iterator',
          triggerData: { item: args.item, index: args.index, total: args.total } as object,
          isDryRun: args.isDryRun,
          startedAt: args.iterStartedAt,
          idempotencyKey: args.idempotencyKey,
        },
        select: { id: true },
      });
      return child.id;
    } catch (err) {
      if (isUniqueViolation(err)) {
        const winner = await this.prisma.workflowExecution.findFirst({
          where: { workflowId: args.workflowId, idempotencyKey: args.idempotencyKey },
          select: { id: true },
        });
        if (winner) return winner.id;
      }
      throw err;
    }
  }

  private buildContext(
    executionId: string,
    workflowId: string,
    nodeId: string,
    isDryRun: boolean,
    depth: number,
    requestId: string | undefined,
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
      requestId,
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
