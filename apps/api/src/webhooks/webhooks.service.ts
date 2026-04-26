import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EXECUTION_JOB_NAME, EXECUTION_QUEUE_NAME } from '../executions/execution-queue.constants';
import type { WorkflowExecutionJobPayload } from '../executions/executions.service';

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

const REPLAY_WINDOW_SECONDS = 300;
const HMAC_HEX_LENGTH = 64;
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

    this.assertFreshTimestamp(input.timestamp);
    this.assertValidSignature(webhook.hmacSecret, input.timestamp!, input.rawBody, input.signature);

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

  private assertFreshTimestamp(timestamp: string | undefined): void {
    if (!timestamp) {
      throw new UnauthorizedException('Invalid signature');
    }
    const parsed = Number.parseInt(timestamp, 10);
    if (!Number.isFinite(parsed) || String(parsed) !== timestamp.trim()) {
      throw new UnauthorizedException('Invalid signature');
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - parsed) > REPLAY_WINDOW_SECONDS) {
      throw new UnauthorizedException('Invalid signature');
    }
  }

  private assertValidSignature(
    secret: string,
    timestamp: string,
    rawBody: Buffer,
    signature: string | undefined,
  ): void {
    if (!signature || signature.length !== HMAC_HEX_LENGTH) {
      throw new UnauthorizedException('Invalid signature');
    }

    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody.toString('utf8')}`)
      .digest('hex');

    const expectedBuf = Buffer.from(expected, 'hex');
    let providedBuf: Buffer;
    try {
      providedBuf = Buffer.from(signature, 'hex');
    } catch {
      throw new UnauthorizedException('Invalid signature');
    }

    if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
      throw new UnauthorizedException('Invalid signature');
    }
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
