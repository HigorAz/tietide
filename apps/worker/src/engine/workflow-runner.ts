import { Inject, Injectable, Logger as NestLogger } from '@nestjs/common';
import type { WorkflowDefinition, WorkflowNode, WorkflowEdge } from '@tietide/shared';
import type { ExecutionContext, Logger, NodeOutput } from '@tietide/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { NodeRegistry } from '../nodes/registry';
import { SECRET_RESOLVER, type SecretResolver } from './secret-resolver';
import { CircularDependencyError, topologicalSort } from './topological-sort';

export interface RunArgs {
  executionId: string;
  workflowId: string;
  definition: WorkflowDefinition;
  triggerData?: Record<string, unknown>;
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
  ) {}

  async run(args: RunArgs): Promise<RunResult> {
    const { executionId, workflowId, definition, triggerData } = args;

    let order: string[];
    try {
      order = topologicalSort(definition);
    } catch (err) {
      if (err instanceof CircularDependencyError) {
        return { status: 'FAILED', error: err.message };
      }
      return { status: 'FAILED', error: (err as Error).message };
    }

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

      const started = Date.now();
      try {
        const executor = this.registry.resolve(n.type)!;
        const ctx = this.buildContext(executionId, workflowId, n.id);
        const output = await executor.execute(input, ctx);
        const durationMs = Date.now() - started;

        outputs.set(n.id, output);
        executionOrder.push(n.id);

        await this.prisma.executionStep.update({
          where: { id: step.id },
          data: {
            nodeId: n.id,
            status: 'SUCCESS',
            inputData: input.data as object,
            outputData: output.data as object,
            finishedAt: new Date(),
            durationMs,
          },
        });

        this.propagateReachability(output, outgoingEdges.get(n.id) ?? [], reachable);
      } catch (err) {
        const message = (err as Error).message ?? 'Unknown error';
        const durationMs = Date.now() - started;
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
            finishedAt: new Date(),
            durationMs,
          },
        });
        failure = { nodeId: n.id, error: message };
      }
    }

    if (failure) {
      return { status: 'FAILED', error: failure.error, failedNodeId: failure.nodeId };
    }
    return { status: 'SUCCESS' };
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
    return { data, params: n.config };
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

  private buildContext(executionId: string, workflowId: string, nodeId: string): ExecutionContext {
    const resolver = this.secretResolver;
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
      getSecret: (name: string) => resolver.getSecret(executionId, name),
    };
  }
}
