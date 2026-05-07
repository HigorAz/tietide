import { Inject, Injectable, forwardRef } from '@nestjs/common';
import type { ExecutionContext, INodeExecutor, NodeInput, NodeOutput } from '@tietide/sdk';
import { subworkflowConfigSchema, subworkflowOutputSchema } from '@tietide/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { EngineService, type ExecutePayload as _ExecutePayload } from '../../engine/engine.service';
import { MAX_RECURSION_DEPTH, RecursionDepthExceededError } from '../../engine/workflow-runner';

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

    // Spawn the child execution row up front so the WS overlay sees it
    // appear before the engine flips it to RUNNING.
    const child = await this.prisma.workflowExecution.create({
      data: {
        workflowId: config.workflowId,
        parentExecutionId: context.executionId,
        status: 'PENDING',
        triggerType: 'subworkflow',
        triggerData: config.inputMapping as object,
        isDryRun: context.isDryRun,
      },
      select: { id: true },
    });

    await this.engine.execute({
      executionId: child.id,
      workflowId: config.workflowId,
      triggerType: 'subworkflow',
      triggerData: config.inputMapping,
      parentExecutionId: context.executionId,
      depth: depth + 1,
      isDryRun: context.isDryRun,
    });

    const finalRow = await this.prisma.workflowExecution.findUnique({
      where: { id: child.id },
      select: { status: true, error: true },
    });
    if (!finalRow || finalRow.status !== 'SUCCESS') {
      throw new SubworkflowFailedError(child.id, finalRow?.error ?? 'Unknown failure');
    }

    // Prefer the child's most-recently-completed return-node output as the
    // subworkflow's return value. Fall back to the latest SUCCESS step so
    // existing single-sink workflows can be invoked as subworkflows
    // without an explicit return node.
    const returnStep = await this.prisma.executionStep.findFirst({
      where: { executionId: child.id, nodeType: 'return', status: 'SUCCESS' },
      orderBy: { finishedAt: 'desc' },
      select: { outputData: true },
    });
    if (returnStep?.outputData && typeof returnStep.outputData === 'object') {
      const out = returnStep.outputData as Record<string, unknown>;
      return { data: this.coerceToRecord(out.value) };
    }

    const latest = await this.prisma.executionStep.findFirst({
      where: { executionId: child.id, status: 'SUCCESS' },
      orderBy: { finishedAt: 'desc' },
      select: { outputData: true },
    });
    if (latest?.outputData && typeof latest.outputData === 'object') {
      return { data: latest.outputData as Record<string, unknown> };
    }
    return { data: {} };
  }

  private coerceToRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return { value };
  }
}
