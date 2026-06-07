import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EXECUTION_JOB_NAME, EXECUTION_QUEUE_NAME } from '../executions/execution-queue.constants';
import type { WorkflowExecutionJobPayload } from '../executions/executions.service';
import { assertFreshTimestamp, assertValidHexHmac } from './signature-helpers';

export interface WebhookTriggerInput {
  path: string;
  rawBody: Buffer;
  signature: string | undefined;
  timestamp: string | undefined;
  requestId?: string;
}

export interface WebhookTriggerResult {
  executionId: string;
  status: string;
}

const MAX_ATTEMPTS = 3;
const BACKOFF_DELAY_MS = 1000;

@Injectable()
export class WebhooksService {
  private readonly log = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(EXECUTION_QUEUE_NAME) private readonly queue: Queue,
  ) {}

  async trigger(input: WebhookTriggerInput): Promise<WebhookTriggerResult> {
    const webhook = await this.prisma.webhook.findUnique({
      where: { path: input.path },
      include: { workflow: { select: { id: true, userId: true, organizationId: true } } },
    });

    if (!webhook || !webhook.isActive) {
      throw new NotFoundException('Webhook not found');
    }

    assertFreshTimestamp(input.timestamp);
    assertValidHexHmac(webhook.hmacSecret, input.timestamp!, input.rawBody, input.signature);

    const triggerData = this.parseBody(input.rawBody);

    // A replay within the freshness window reuses the exact same
    // (timestamp, signature) tuple, so key idempotency on it. Combined with the
    // @@unique([workflowId, idempotencyKey]) constraint this rejects in-window
    // replays instead of spawning a duplicate execution per replay.
    const idempotencyKey = `webhook:${createHash('sha256')
      .update(`${input.timestamp ?? ''}:${input.signature ?? ''}`)
      .digest('hex')
      .slice(0, 32)}`;

    const existing = await this.prisma.workflowExecution.findFirst({
      where: { workflowId: webhook.workflow.id, idempotencyKey },
      select: { id: true, status: true },
    });
    if (existing) {
      this.log.log(
        { webhookPath: input.path, workflowId: webhook.workflow.id, idempotencyKey },
        'Duplicate webhook delivery (replay), skipping',
      );
      return { executionId: existing.id, status: existing.status };
    }

    const triggerDataJson = triggerData as Prisma.InputJsonValue;
    let created: { id: string };
    try {
      created = await this.prisma.workflowExecution.create({
        data: {
          workflowId: webhook.workflow.id,
          status: 'PENDING',
          triggerType: 'webhook',
          triggerData: triggerDataJson,
          idempotencyKey,
        },
        select: { id: true },
      });
    } catch (err) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: unknown }).code === 'P2002'
      ) {
        const dup = await this.prisma.workflowExecution.findFirst({
          where: { workflowId: webhook.workflow.id, idempotencyKey },
          select: { id: true, status: true },
        });
        if (dup) return { executionId: dup.id, status: dup.status };
      }
      throw err;
    }

    const payload: WorkflowExecutionJobPayload = {
      executionId: created.id,
      workflowId: webhook.workflow.id,
      triggerType: 'webhook',
      triggerData,
      userId: webhook.workflow.userId,
      organizationId: webhook.workflow.organizationId,
      requestId: input.requestId,
    };

    await this.queue.add(EXECUTION_JOB_NAME, payload, {
      jobId: created.id,
      attempts: MAX_ATTEMPTS,
      backoff: { type: 'exponential', delay: BACKOFF_DELAY_MS },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 24 * 3600 },
    });

    this.log.log(
      { webhookPath: input.path, executionId: created.id, workflowId: webhook.workflow.id },
      'Webhook accepted, execution enqueued',
    );

    return { executionId: created.id, status: 'PENDING' };
  }

  private parseBody(rawBody: Buffer): Record<string, unknown> {
    if (rawBody.length === 0) {
      return {};
    }
    try {
      const parsed = JSON.parse(rawBody.toString('utf8')) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return { value: parsed };
    } catch {
      return { raw: rawBody.toString('utf8') };
    }
  }
}
