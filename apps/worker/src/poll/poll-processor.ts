import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';
import type { Logger as SdkLogger } from '@tietide/sdk';
import type { WorkflowDefinition, WorkflowNode } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PollTriggerRegistry } from './poll-trigger.registry';
import { PollConnectionLoader } from './poll-connection-loader';
import { POLL_QUEUE_NAME } from './poll.constants';
import type { PollFirePayload } from './poll-scheduler.service';
import { isUniqueViolation } from '../common/prisma-error';

const EXECUTION_QUEUE_NAME = 'workflow-execution';
const EXECUTION_JOB_NAME = 'execute';
const MAX_ATTEMPTS = 3;
const BACKOFF_DELAY_MS = 1000;

@Processor(POLL_QUEUE_NAME)
export class PollProcessor extends WorkerHost {
  private readonly log = new Logger(PollProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PollTriggerRegistry,
    private readonly loader: PollConnectionLoader,
    @InjectQueue(EXECUTION_QUEUE_NAME) private readonly executionQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<PollFirePayload>): Promise<void> {
    const { workflowId, userId, nodeId, type } = job.data;

    const trigger = this.registry.get(type);
    if (!trigger) {
      this.log.warn({ jobId: job.id, type }, 'No poll trigger registered for type');
      return;
    }

    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { id: true, userId: true, isActive: true, definition: true },
    });
    if (!workflow || !workflow.isActive) {
      this.log.log(
        { jobId: job.id, workflowId },
        'Workflow inactive or missing; skipping poll tick',
      );
      return;
    }

    const node = this.findNode(workflow.definition, nodeId, type);
    if (!node) {
      this.log.warn(
        { jobId: job.id, workflowId, nodeId, type },
        'Trigger node no longer in workflow definition; skipping',
      );
      return;
    }

    const connectionIdRaw = (node.config ?? {})['connectionId'];
    if (typeof connectionIdRaw !== 'string' || connectionIdRaw.length === 0) {
      this.log.warn({ jobId: job.id, nodeId }, 'Trigger node missing connectionId');
      return;
    }
    const connection = await this.loader.load(userId, connectionIdRaw);
    if (!connection) return;

    const cursorRow = await this.prisma.triggerCursor.findUnique({
      where: { workflowId_nodeId: { workflowId, nodeId } },
    });
    const cursor = cursorRow?.cursor ?? null;

    const sdkLogger = this.scopedLogger(workflowId, nodeId);
    const result = await trigger.poll({
      workflowId,
      nodeId,
      connection,
      config: (node.config ?? {}) as Record<string, unknown>,
      cursor,
      logger: sdkLogger,
    });

    const triggerType = `poll:${type}`;
    for (const item of result.items) {
      const idempotencyKey = this.idempotencyKey(workflowId, nodeId, item);

      const existing = await this.prisma.workflowExecution.findFirst({
        where: { workflowId, idempotencyKey },
        select: { id: true },
      });
      if (existing) {
        this.log.log({ workflowId, nodeId, idempotencyKey }, 'Duplicate poll item, skipping');
        continue;
      }

      let created: { id: string };
      try {
        created = await this.prisma.workflowExecution.create({
          data: {
            workflowId,
            status: 'PENDING',
            triggerType,
            triggerData: item as unknown as Prisma.InputJsonValue,
            idempotencyKey,
          },
        });
      } catch (err) {
        // The findFirst dedup above is not atomic with this create: an overlapping
        // tick (a slow poll whose successor already started) can pass its own
        // findFirst and commit the same idempotencyKey first, so our create loses
        // on the @@unique([workflowId, idempotencyKey]) constraint (P2002). The
        // item is durably created + enqueued by the winner, so skip it and keep
        // going — the cursor still advances at the end (unlike an enqueue failure,
        // which rethrows below and holds the cursor for an at-least-once re-poll).
        if (isUniqueViolation(err)) {
          this.log.log(
            { workflowId, nodeId, idempotencyKey },
            'Concurrent poll item lost the idempotency race, skipping duplicate',
          );
          continue;
        }
        throw err;
      }

      await this.executionQueue.add(
        EXECUTION_JOB_NAME,
        {
          executionId: created.id,
          workflowId,
          triggerType,
          triggerData: item,
          userId,
        },
        {
          jobId: created.id,
          attempts: MAX_ATTEMPTS,
          backoff: { type: 'exponential', delay: BACKOFF_DELAY_MS },
          removeOnComplete: { age: 3600, count: 1000 },
          removeOnFail: { age: 24 * 3600 },
        },
      );
    }

    // Advance the cursor ONLY after every item has been durably created and
    // enqueued. If a create/enqueue above throws, process() rejects with the
    // cursor still at its old value, so the next tick re-polls the same window
    // and the idempotencyKey dedup skips items that were already enqueued —
    // making the trigger at-least-once instead of silently dropping the tail.
    // (Empty-result ticks still advance the watermark via this same path.)
    if (result.newCursor !== cursor) {
      await this.prisma.triggerCursor.upsert({
        where: { workflowId_nodeId: { workflowId, nodeId } },
        update: { cursor: result.newCursor, lastPolledAt: new Date() },
        create: { workflowId, nodeId, cursor: result.newCursor },
      });
    }
  }

  private findNode(definition: unknown, nodeId: string, type: string): WorkflowNode | null {
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) return null;
    const def = definition as WorkflowDefinition;
    if (!Array.isArray(def.nodes)) return null;
    const node = def.nodes.find((n) => n.id === nodeId && n.type === type);
    return node ?? null;
  }

  private idempotencyKey(workflowId: string, nodeId: string, item: unknown): string {
    const json = JSON.stringify(item ?? null);
    const digest = createHash('sha256').update(json).digest('hex').slice(0, 16);
    return `poll:${workflowId}:${nodeId}:${digest}`;
  }

  private scopedLogger(workflowId: string, nodeId: string): SdkLogger {
    const meta = { workflowId, nodeId };
    return {
      info: (msg, ctx) => this.log.log({ ...meta, ...ctx }, msg),
      warn: (msg, ctx) => this.log.warn({ ...meta, ...ctx }, msg),
      error: (msg, ctx) => this.log.error({ ...meta, ...ctx }, msg),
      debug: (msg, ctx) => this.log.debug({ ...meta, ...ctx }, msg),
    };
  }
}
