import { Inject, Injectable, forwardRef } from '@nestjs/common';
import type { ExecutionContext, INodeExecutor, NodeInput, NodeOutput } from '@tietide/sdk';
import { subworkflowConfigSchema, subworkflowOutputSchema } from '@tietide/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { EngineService, type ExecutePayload as _ExecutePayload } from '../../engine/engine.service';
import { MAX_RECURSION_DEPTH, RecursionDepthExceededError } from '../../engine/workflow-runner';
import { isUniqueViolation } from '../../common/prisma-error';

export const SUBWORKFLOW_NODE_TYPE = 'subworkflow';

export class SubworkflowTargetNotFoundError extends Error {
  constructor(workflowId: string) {
    super(`Subworkflow target workflow "${workflowId}" not found or not accessible`);
    this.name = 'SubworkflowTargetNotFoundError';
  }
}

export class SubworkflowFailedError extends Error {
  readonly childExecutionId: string;
  constructor(childExecutionId: string, message: string) {
    super(`Subworkflow child execution ${childExecutionId} failed: ${message}`);
    this.name = 'SubworkflowFailedError';
    this.childExecutionId = childExecutionId;
  }
}

@Injectable()
export class SubworkflowAction implements INodeExecutor {
  readonly type = SUBWORKFLOW_NODE_TYPE;
  readonly name = 'Subworkflow';
  readonly description = 'Invokes another workflow synchronously and returns its return value.';
  readonly category = 'logic' as const;
  readonly outputSchema = subworkflowOutputSchema;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => EngineService))
    private readonly engine: EngineService,
  ) {}

  async execute(input: NodeInput, context: ExecutionContext): Promise<NodeOutput> {
    const depth = context.depth ?? 0;
    if (depth >= MAX_RECURSION_DEPTH) {
      throw new RecursionDepthExceededError(depth + 1);
    }

    const config = subworkflowConfigSchema.parse(input.params);

    // Look up the parent execution to find the caller's userId, then scope
    // the target workflow lookup to that user. This is the IDOR guard.
    const parent = await this.prisma.workflowExecution.findUnique({
      where: { id: context.executionId },
      include: { workflow: { select: { userId: true } } },
    });
    if (!parent) {
      throw new Error(`Subworkflow caller execution ${context.executionId} not found`);
    }
    const target = await this.prisma.workflow.findFirst({
      where: { id: config.workflowId, userId: parent.workflow.userId },
      select: { id: true },
    });
    if (!target) {
      throw new SubworkflowTargetNotFoundError(config.workflowId);
    }

    // Tie the child to this exact parent node so a re-processed parent execution
    // (e.g. a future BullMQ retry — see W1.8) reuses the child it already spawned
    // instead of running the subworkflow again (duplicate side effects). Scoped
    // per target workflow via the child's @@unique([workflowId, idempotencyKey]).
    const idempotencyKey = `subworkflow:${context.executionId}:${context.nodeId}`;
    const existing = await this.prisma.workflowExecution.findFirst({
      where: { workflowId: config.workflowId, idempotencyKey },
      select: { id: true, status: true },
    });

    let childId: string;
    if (existing?.status === 'SUCCESS') {
      // A previous attempt already completed this child — reuse its result and do
      // NOT re-run it (the whole point of the idempotency guard).
      childId = existing.id;
    } else {
      childId = existing
        ? existing.id // prior attempt created it but did not finish — re-run in place
        : await this.createChild(config, context, idempotencyKey);

      await this.engine.execute({
        executionId: childId,
        workflowId: config.workflowId,
        triggerType: 'subworkflow',
        triggerData: config.inputMapping,
        parentExecutionId: context.executionId,
        depth: depth + 1,
        isDryRun: context.isDryRun,
        requestId: context.requestId,
      });

      const finalRow = await this.prisma.workflowExecution.findUnique({
        where: { id: childId },
        select: { status: true, error: true },
      });
      if (!finalRow || finalRow.status !== 'SUCCESS') {
        throw new SubworkflowFailedError(childId, finalRow?.error ?? 'Unknown failure');
      }
    }

    // Prefer the child's most-recently-completed return-node output as the
    // subworkflow's return value. Fall back to the latest SUCCESS step so
    // existing single-sink workflows can be invoked as subworkflows
    // without an explicit return node.
    const returnStep = await this.prisma.executionStep.findFirst({
      where: { executionId: childId, nodeType: 'return', status: 'SUCCESS' },
      orderBy: { finishedAt: 'desc' },
      select: { outputData: true },
    });
    if (returnStep?.outputData && typeof returnStep.outputData === 'object') {
      const out = returnStep.outputData as Record<string, unknown>;
      return { data: this.coerceToRecord(out.value) };
    }

    const latest = await this.prisma.executionStep.findFirst({
      where: { executionId: childId, status: 'SUCCESS' },
      orderBy: { finishedAt: 'desc' },
      select: { outputData: true },
    });
    if (latest?.outputData && typeof latest.outputData === 'object') {
      return { data: latest.outputData as Record<string, unknown> };
    }
    return { data: {} };
  }

  // Spawn the child execution row up front (so the WS overlay sees it appear
  // before the engine flips it to RUNNING), tolerating a concurrent attempt that
  // wins the unique-key race by reusing the row it created.
  private async createChild(
    config: ReturnType<typeof subworkflowConfigSchema.parse>,
    context: ExecutionContext,
    idempotencyKey: string,
  ): Promise<string> {
    try {
      const child = await this.prisma.workflowExecution.create({
        data: {
          workflowId: config.workflowId,
          parentExecutionId: context.executionId,
          status: 'PENDING',
          triggerType: 'subworkflow',
          triggerData: config.inputMapping as object,
          isDryRun: context.isDryRun,
          idempotencyKey,
        },
        select: { id: true },
      });
      return child.id;
    } catch (err) {
      if (isUniqueViolation(err)) {
        const winner = await this.prisma.workflowExecution.findFirst({
          where: { workflowId: config.workflowId, idempotencyKey },
          select: { id: true },
        });
        if (winner) return winner.id;
      }
      throw err;
    }
  }

  private coerceToRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return { value };
  }
}
