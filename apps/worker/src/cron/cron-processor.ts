import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CRON_QUEUE_NAME, EXECUTION_JOB_NAME, EXECUTION_QUEUE_NAME } from './cron.constants';
import { isUniqueViolation } from '../common/prisma-error';

export interface CronFirePayload {
  workflowId: string;
  userId: string;
  expression: string;
}

interface ExecutionJobPayload {
  executionId: string;
  workflowId: string;
  triggerType: 'cron';
  triggerData: Record<string, unknown>;
  userId: string;
}

const MAX_ATTEMPTS = 3;
const BACKOFF_DELAY_MS = 1000;

@Processor(CRON_QUEUE_NAME)
export class CronProcessor extends WorkerHost {
  private readonly log = new Logger(CronProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(EXECUTION_QUEUE_NAME) private readonly executionQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<CronFirePayload>): Promise<void> {
    const { workflowId, expression } = job.data;

    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { id: true, userId: true, isActive: true },
    });

    if (!workflow) {
      this.log.warn({ workflowId, jobId: job.id }, 'Cron fired for missing workflow');
      return;
    }
    if (!workflow.isActive) {
      this.log.log({ workflowId, jobId: job.id }, 'Cron fired for inactive workflow, skipping');
      return;
    }

    const scheduledFor = this.computeScheduledFor(job);
    const idempotencyKey = `cron:${workflowId}:${scheduledFor}`;

    const existing = await this.prisma.workflowExecution.findFirst({
      where: { workflowId, idempotencyKey },
      select: { id: true },
    });
    if (existing) {
      this.log.log(
        { workflowId, idempotencyKey, executionId: existing.id },
        'Duplicate cron tick, skipping',
      );
      return;
    }

    const triggerData = { scheduledFor, expression };

    let created: { id: string };
    try {
      created = await this.prisma.workflowExecution.create({
        data: {
          workflowId,
          status: 'PENDING',
          triggerType: 'cron',
          triggerData: triggerData as unknown as Prisma.InputJsonValue,
          idempotencyKey,
        },
      });
    } catch (err) {
      // The findFirst dedup above is not atomic with this create: if two ticks
      // for the same scheduled timestamp run concurrently, both can pass the
      // findFirst and reach here, and the loser hits the
      // @@unique([workflowId, idempotencyKey]) constraint (P2002). The winner has
      // already created + enqueued the run, so swallow the duplicate and skip.
      if (isUniqueViolation(err)) {
        this.log.log(
          { workflowId, idempotencyKey },
          'Concurrent cron tick lost the idempotency race, skipping duplicate',
        );
        return;
      }
      throw err;
    }

    const payload: ExecutionJobPayload = {
      executionId: created.id,
      workflowId,
      triggerType: 'cron',
      triggerData,
      userId: workflow.userId,
    };

    await this.executionQueue.add(EXECUTION_JOB_NAME, payload, {
      jobId: created.id,
      attempts: MAX_ATTEMPTS,
      backoff: { type: 'exponential', delay: BACKOFF_DELAY_MS },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 24 * 3600 },
    });
  }

  private computeScheduledFor(job: Job<CronFirePayload>): string {
    // Key the cron idempotency on the SCHEDULED fire time, not the processing time.
    // `processedOn` is when a worker picked the job up — it differs on every
    // attempt/retry, so using it made the idempotency key drift and let the same
    // tick run twice. BullMQ job-scheduler job ids end in the scheduled epoch
    // millis (`repeat:<key>:<millis>`); fall back to the job's enqueue timestamp.
    const ms = this.scheduledMillisFromId(job.id) ?? job.timestamp ?? Date.now();
    return new Date(ms).toISOString();
  }

  private scheduledMillisFromId(id: string | undefined): number | null {
    if (!id) return null;
    const match = /:(\d+)$/.exec(id);
    if (!match) return null;
    const ms = Number.parseInt(match[1], 10);
    return Number.isFinite(ms) ? ms : null;
  }
}
