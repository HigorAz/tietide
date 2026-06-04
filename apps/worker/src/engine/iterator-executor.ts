import { Injectable } from '@nestjs/common';
import {
  ITERATOR_MAX_ITEMS_DEFAULT,
  iteratorConfigSchema,
  type EnvScope,
  type WorkflowDefinition,
  type WorkflowNode,
  type WorkflowEdge,
} from '@tietide/shared';
import type { NodeOutput } from '@tietide/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionEventsService } from '../events/execution-events.service';
import { buildBodyDefinition, extractBodySubgraph, validateBodySubgraph } from './iterator-runner';
import { isUniqueViolation } from '../common/prisma-error';
import { buildInput, propagateReachability, resolveInputTemplates } from './runner-helpers';
import type { RunArgs, RunResult } from './workflow-runner';

// A single iterator node's execution: fan out the body subgraph once per array
// item via child WorkflowExecutions, then route the parent's `done` branch.
// Extracted from WorkflowRunner so the runner stays focused on the main DAG loop.
// The recursive body run re-enters through WorkflowRunner.run via the `runChild`
// callback (not by holding a runner reference) — this keeps the per-execution
// resolver-cache release in run()'s finally block intact and avoids a DI cycle.
export interface IteratorRunOptions {
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
  aliasMap: ReadonlyMap<string, string>;
  requestId: string | undefined;
  // Re-enter the workflow runner for one iteration's body subgraph. Wired by
  // WorkflowRunner to `(args) => this.run(args)` so recursion stays on the runner.
  runChild: (args: RunArgs) => Promise<RunResult>;
}

@Injectable()
export class IteratorExecutor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ExecutionEventsService,
  ) {}

  async run(opts: IteratorRunOptions): Promise<{ status: 'SUCCESS' | 'FAILED'; error?: string }> {
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
      aliasMap,
      requestId,
      runChild,
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

    const builtInput = buildInput(n, executionOrder, incoming, outputs, triggerData);

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
      const resolvedInput = resolveInputTemplates(
        builtInput,
        executionOrder,
        outputs,
        envScope,
        aliasMap,
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
        const childResult = await runChild({
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
    propagateReachability(iteratorOutput, outgoing, reachable, 'success');

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
}
