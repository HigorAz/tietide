import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
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
      include: { workflow: { select: { id: true, userId: true } } },
    });

    if (!webhook || !webhook.isActive) {
      throw new NotFoundException('Webhook not found');
    }

    assertFreshTimestamp(input.timestamp);
    assertValidHexHmac(webhook.hmacSecret, input.timestamp!, input.rawBody, input.signature);

    const triggerData = this.parseBody(input.rawBody);

    const triggerDataJson = triggerData as Prisma.InputJsonValue;
    const created = await this.prisma.workflowExecution.create({
      data: {
        workflowId: webhook.workflow.id,
        status: 'PENDING',
        triggerType: 'webhook',
        triggerData: triggerDataJson,
      },
    });

    const payload: WorkflowExecutionJobPayload = {
      executionId: created.id,
      workflowId: webhook.workflow.id,
      triggerType: 'webhook',
      triggerData,
      userId: webhook.workflow.userId,
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
