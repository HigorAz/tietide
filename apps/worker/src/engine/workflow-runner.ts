import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

type PinoChildLogger = ReturnType<PinoLogger['logger']['child']>;
import {
  NodeCategory,
  NodeType,
  assignNodeAliases,
  type EnvScope,
  type WorkflowDefinition,
  type WorkflowNode,
  type WorkflowEdge,
} from '@tietide/shared';
import type { ExecutionContext, Logger as SdkLogger, NodeOutput } from '@tietide/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { NodeRegistry } from '../nodes/registry';
import { ExecutionEventsService } from '../events/execution-events.service';
import { SECRET_RESOLVER, type SecretResolver } from './secret-resolver';
import { ENV_VAR_RESOLVER, type EnvVarResolver } from './env-var-resolver';
import { CONNECTION_RESOLVER, type ConnectionResolver } from '../connections/connection-resolver';
import { CircularDependencyError, topologicalSort } from './topological-sort';
import { ITERATOR_NODE_TYPE } from '../nodes/logic/iterator';
import { IteratorExecutor } from './iterator-executor';
import { resolveNodeTimeoutMs, withNodeTimeout } from './node-timeout';
import { StepBudget, StepBudgetExceededError } from './step-budget';
import {
  buildInput,
  classifyUnreached,
  extractErrorCode,
  isTriggerNode,
  propagateReachability,
  resolveInputTemplates,
} from './runner-helpers';

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
  // Shared per-execution-tree step budget (W5.16). Created once at the top-level
  // run and passed by reference into every iterator/subworkflow child so the whole
  // tree shares one cap on processed nodes, defeating the multiplicative
  // depth × per-iterator fan-out DoS. Left unset for top-level runs (the runner
  // mints a fresh budget); children receive the parent's budget.
  stepBudget?: StepBudget;
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
    private readonly iterator: IteratorExecutor,
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

    // Shared step budget for the whole parent->child execution tree (W5.16). The
    // top-level run mints it; iterator/subworkflow children inherit it by reference
    // so the multiplicative depth × per-iterator fan-out is bounded by one global cap.
    // Only the OWNER (top-level) run converts a blown budget into a FAILED result;
    // child runs rethrow it so the abort unwinds the entire tree at once rather than
    // being masked per-iteration by an iterator's continueOnError.
    const ownsBudget = args.stepBudget === undefined;
    const stepBudget = args.stepBudget ?? new StepBudget();

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

    // Stable reference aliases (`trigger`, `steps.<slug>`) for data-pill tokens,
    // computed over the full saved definition so they match what the SPA emitted.
    const aliasMap = assignNodeAliases(definition.nodes);

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

    try {
      await this.runNodeLoop({
        order,
        nodeById,
        incomingEdges,
        outgoingEdges,
        reusable,
        outputs,
        reachable,
        executionOrder,
        statusByNode,
        stepBudget,
        executionId,
        workflowId,
        definition,
        triggerData,
        isDryRun,
        depth,
        envScope,
        aliasMap,
        runLog,
        requestId: args.requestId,
        setFailure: (f) => {
          failure = f;
        },
        getFailure: () => failure,
      });
    } catch (err) {
      // A blown step budget aborts the whole tree non-retryably (W5.16): the
      // definition is structurally too large / fans out too far, so a BullMQ retry
      // would re-hit the cap. Other errors are unexpected runner crashes — propagate.
      if (err instanceof StepBudgetExceededError) {
        // Children rethrow so the budget overflow unwinds the whole tree (it must not
        // be masked by an iterator's continueOnError). Only the owner converts it to a
        // terminal non-retryable FAILED for the top-level execution.
        if (!ownsBudget) throw err;
        runLog.warn(
          { executionId, workflowId, used: stepBudget.consumed, max: stepBudget.max },
          err.message,
        );
        return { status: 'FAILED', error: err.message, retryable: false };
      }
      throw err;
    }

    if (failure) {
      // A node threw at runtime — retryable (a flaky dependency may recover). The
      // step-level resume above means a BullMQ retry won't re-fire nodes that
      // already succeeded, so re-running this execution is safe.
      return {
        status: 'FAILED',
        error: (failure as { nodeId: string; error: string }).error,
        failedNodeId: (failure as { nodeId: string; error: string }).nodeId,
        retryable: true,
      };
    }
    return { status: 'SUCCESS' };
  }

  // The main DAG processing loop, extracted so runInner can wrap it in a single
  // try/catch for the per-execution step budget (W5.16). Mutates the shared
  // outputs/reachable/executionOrder/statusByNode collections and reports a hard
  // failure back via setFailure.
  private async runNodeLoop(p: {
    order: string[];
    nodeById: Map<string, WorkflowNode>;
    incomingEdges: Map<string, WorkflowEdge[]>;
    outgoingEdges: Map<string, WorkflowEdge[]>;
    reusable: Map<string, Record<string, unknown>>;
    outputs: Map<string, NodeOutput>;
    reachable: Set<string>;
    executionOrder: string[];
    statusByNode: Map<string, string>;
    stepBudget: StepBudget;
    executionId: string;
    workflowId: string;
    definition: WorkflowDefinition;
    triggerData: Record<string, unknown> | undefined;
    isDryRun: boolean;
    depth: number;
    envScope: EnvScope;
    aliasMap: ReadonlyMap<string, string>;
    runLog: PinoChildLogger;
    requestId: string | undefined;
    setFailure: (f: { nodeId: string; error: string }) => void;
    getFailure: () => { nodeId: string; error: string } | null;
  }): Promise<void> {
    const {
      order,
      nodeById,
      incomingEdges,
      outgoingEdges,
      reusable,
      outputs,
      reachable,
      executionOrder,
      statusByNode,
      stepBudget,
      executionId,
      workflowId,
      definition,
      triggerData,
      isDryRun,
      depth,
      envScope,
      aliasMap,
      runLog,
      requestId,
      setFailure,
      getFailure,
    } = p;

    for (const nodeId of order) {
      const n = nodeById.get(nodeId)!;
      const failure = getFailure();

      // Charge one unit to the shared per-execution-tree budget BEFORE recording or
      // running anything for this node (W5.16). When exhausted this throws, unwinding
      // to runInner's catch which aborts the whole tree non-retryably — bounding the
      // multiplicative iterator/subworkflow fan-out independent of the depth and
      // per-iterator caps.
      stepBudget.consume();

      // A hard failure with no error-handler aborts the rest of the run: every
      // remaining node is CANCELLED regardless of why it would not have run.
      if (failure) {
        await this.recordCancelled(executionId, n);
        statusByNode.set(n.id, 'CANCELLED');
        continue;
      }
      if (!reachable.has(nodeId)) {
        const reason = classifyUnreached(incomingEdges.get(n.id) ?? [], statusByNode);
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
        propagateReachability(reusedOutput, outgoingEdges.get(n.id) ?? [], reachable, 'success');
        continue;
      }

      const input = buildInput(
        n,
        executionOrder,
        incomingEdges.get(n.id) ?? [],
        outputs,
        triggerData,
      );

      if (n.skipped === true && !isTriggerNode(n)) {
        await this.recordSkipped(executionId, n, input.data);
        statusByNode.set(n.id, 'SKIPPED');
        const passthroughOutput: NodeOutput = { data: input.data };
        outputs.set(n.id, passthroughOutput);
        executionOrder.push(n.id);
        propagateReachability(
          passthroughOutput,
          outgoingEdges.get(n.id) ?? [],
          reachable,
          'success',
        );
        continue;
      }

      if (n.type === ITERATOR_NODE_TYPE) {
        const iterResult = await this.iterator.run({
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
          aliasMap,
          requestId,
          stepBudget,
          runChild: (childArgs) => this.run(childArgs),
        });
        statusByNode.set(n.id, iterResult.status);
        if (iterResult.status === 'FAILED') {
          setFailure({ nodeId: n.id, error: iterResult.error ?? 'Iterator failed' });
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
        const ctx = this.buildContext(executionId, workflowId, n.id, isDryRun, depth, requestId);
        const resolvedInput = resolveInputTemplates(
          input,
          executionOrder,
          outputs,
          envScope,
          aliasMap,
        );
        // Engine-enforced per-node wall-clock budget (W5.15): a node that overruns
        // (e.g. SELECT pg_sleep(3600), whose connector sets no statement timeout) is
        // abandoned so it cannot hold one of the worker's concurrent slots
        // indefinitely and starve other tenants. The timeout rejection lands in the
        // catch below and is recorded as a FAILED (retryable) step.
        const output = await withNodeTimeout(
          executor.execute(resolvedInput, ctx),
          resolveNodeTimeoutMs(),
        );
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

        propagateReachability(output, outgoingEdges.get(n.id) ?? [], reachable, 'success');
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
          propagateReachability(errorOutput, outgoing, reachable, 'error');
        } else {
          setFailure({ nodeId: n.id, error: message });
        }
      }
    }
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
