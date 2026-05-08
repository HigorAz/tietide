import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { EXECUTION_JOB_NAME, EXECUTION_QUEUE_NAME } from '../executions/execution-queue.constants';
import type { WorkflowExecutionJobPayload } from '../executions/executions.service';
import { ProviderTriggerRegistry } from '../provider-triggers/provider-trigger.registry';

export interface ProviderWebhookTriggerInput {
  provider: string;
  subscriptionId: string;
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
  requestId?: string;
}

export interface ProviderWebhookTriggerResult {
  executionId: string;
  status: string;
}

const MAX_ATTEMPTS = 3;
const BACKOFF_DELAY_MS = 1000;

@Injectable()
export class ProviderWebhooksService {
  private readonly log = new Logger(ProviderWebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly registry: ProviderTriggerRegistry,
    @InjectQueue(EXECUTION_QUEUE_NAME) private readonly queue: Queue,
  ) {}

  async trigger(input: ProviderWebhookTriggerInput): Promise<ProviderWebhookTriggerResult> {
    const subscription = await this.prisma.providerSubscription.findUnique({
      where: { id: input.subscriptionId },
      include: {
        workflow: { select: { id: true, userId: true, isActive: true, definition: true } },
      },
    });

    if (!subscription || !subscription.workflow.isActive) {
      throw new NotFoundException('Provider webhook not found');
    }

    if (subscription.provider !== input.provider) {
      throw new NotFoundException('Provider webhook not found');
    }

    // The trigger TYPE is required to dispatch verifySignature/onActivate. We
    // resolve it via the workflow definition (a single provider can map to
    // multiple types — Google has both drive-file-added and gmail-message-received).
    const triggerType = this.findTriggerTypeInDefinition(
      subscription.workflow.definition,
      subscription.nodeId,
    );
    const trigger = triggerType ? this.registry.getByType(triggerType) : null;
    if (!trigger) {
      throw new NotFoundException('Provider webhook not found');
    }

    const signingSecret = this.crypto.decrypt(subscription.secretEnc, subscription.secretNonce);

    // BasePushTrigger.verifySignature returns boolean | Promise<boolean> (sync
    // for HMAC-style triggers like Stripe/Drive; async for triggers that need
    // to verify an OIDC ID token like Gmail Pub/Sub).
    const verified = await Promise.resolve(
      trigger.verifySignature({
        rawBody: input.rawBody,
        headers: input.headers,
        signingSecret,
      }),
    );
    if (!verified) {
      throw new UnauthorizedException('Invalid signature');
    }

    const triggerData = this.parseBody(input.rawBody);
    const executionTriggerType = `provider:${subscription.provider}`;

    const created = await this.prisma.workflowExecution.create({
      data: {
        workflowId: subscription.workflow.id,
        status: 'PENDING',
        triggerType: executionTriggerType,
        triggerData: triggerData as Prisma.InputJsonValue,
      },
    });

    const payload: WorkflowExecutionJobPayload = {
      executionId: created.id,
      workflowId: subscription.workflow.id,
      triggerType: executionTriggerType,
      triggerData,
      userId: subscription.workflow.userId,
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
      {
        provider: input.provider,
        subscriptionId: input.subscriptionId,
        executionId: created.id,
        workflowId: subscription.workflow.id,
      },
      'Provider webhook accepted, execution enqueued',
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

  private findTriggerTypeInDefinition(
    definition: Prisma.JsonValue | null,
    nodeId: string,
  ): string | null {
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) return null;
    const def = definition as { nodes?: unknown };
    if (!Array.isArray(def.nodes)) return null;
    for (const n of def.nodes) {
      if (!n || typeof n !== 'object' || Array.isArray(n)) continue;
      const node = n as { id?: unknown; type?: unknown };
      if (node.id === nodeId && typeof node.type === 'string') {
        return node.type;
      }
    }
    return null;
  }
}
