import { Inject, Injectable, Logger as NestLogger } from '@nestjs/common';
import {
  NODE_CATALOG,
  NodeCategory,
  resolveTemplate,
  type EnvScope,
  type WorkflowDefinition,
  type WorkflowNode,
  type WorkflowEdge,
} from '@tietide/shared';
import type { ExecutionContext, Logger, NodeInput, NodeOutput } from '@tietide/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { NodeRegistry } from '../nodes/registry';
import { ExecutionEventsService } from '../events/execution-events.service';
import { SECRET_RESOLVER, type SecretResolver } from './secret-resolver';
import { ENV_VAR_RESOLVER, type EnvVarResolver } from './env-var-resolver';
import { CONNECTION_RESOLVER, type ConnectionResolver } from '../connections/connection-resolver';
import { CircularDependencyError, topologicalSort } from './topological-sort';

export interface RunArgs {
  executionId: string;
  workflowId: string;
  definition: WorkflowDefinition;
  triggerData?: Record<string, unknown>;
  isDryRun?: boolean;
}

export interface RunResult {
  status: 'SUCCESS' | 'FAILED';
  error?: string;
  failedNodeId?: string;
}

@Injectable()
export class WorkflowRunner {
  private readonly log = new NestLogger(WorkflowRunner.name);

  constructor(
    private readonly registry: NodeRegistry,
    private readonly prisma: PrismaService,
    @Inject(SECRET_RESOLVER) private readonly secretResolver: SecretResolver,
    @Inject(ENV_VAR_RESOLVER) private readonly envVarResolver: EnvVarResolver,
    @Inject(CONNECTION_RESOLVER) private readonly connectionResolver: ConnectionResolver,
    private readonly events: ExecutionEventsService,
  ) {}

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

    let order: string[];
    try {
      order = topologicalSort(definition);
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
      const n = definition.nodes.find((x) => x.id === nodeId)!;
      if (!this.registry.has(n.type)) {
        return { status: 'FAILED', error: `No executor registered for node type "${n.type}"` };
      }
    }

    const nodeById = new Map(definition.nodes.map((n) => [n.id, n]));
    const incomingEdges = new Map<string, WorkflowEdge[]>();
    const outgoingEdges = new Map<string, WorkflowEdge[]>();
    for (const n of definition.nodes) {
      incomingEdges.set(n.id, []);
      outgoingEdges.set(n.id, []);
    }
    for (const e of definition.edges) {
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
        this.propagateReachability(passthroughOutput, outgoingEdges.get(n.id) ?? [], reachable);
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
        const ctx = this.buildContext(executionId, workflowId, n.id, isDryRun);
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

        this.propagateReachability(output, outgoingEdges.get(n.id) ?? [], reachable);
      } catch (err) {
        const message = (err as Error).message ?? 'Unknown error';
        const durationMs = Date.now() - started;
        const finishedAt = new Date();
        this.log.warn(
          { executionId, workflowId, nodeId: n.id, nodeType: n.type },
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
        failure = { nodeId: n.id, error: message };
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
    return connectionId ? { data, params: n.config, connectionId } : { data, params: n.config };
  }

  private propagateReachability(
    output: NodeOutput,
    outgoing: WorkflowEdge[],
    reachable: Set<string>,
  ): void {
    const branch = output.metadata?.branch as string | undefined;
    for (const e of outgoing) {
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

  private buildContext(
    executionId: string,
    workflowId: string,
    nodeId: string,
    isDryRun: boolean,
  ): ExecutionContext {
    const secrets = this.secretResolver;
    const connections = this.connectionResolver;
    const logger: Logger = {
      info: (msg, ctx) => this.log.log({ nodeId, ctx }, msg),
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
      getSecret: (name: string) => secrets.getSecret(executionId, name),
      getConnection: <TConfig = Record<string, unknown>>(connectionId: string) =>
        connections.getConnection<TConfig>(executionId, connectionId),
      markConnectionForRefresh: (connectionId: string) =>
        connections.markForRefresh(executionId, connectionId),
    };
  }
}
