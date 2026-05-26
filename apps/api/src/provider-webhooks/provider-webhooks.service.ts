import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Prisma } from '@prisma/client';
import type { ValidationResponse } from '@tietide/sdk';
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
  // When set, the request was a verified provider handshake (e.g. a Discord
  // PING). The controller replies with this body/200 instead of enqueuing.
  ack?: ValidationResponse;
}

// Structural opt-in for triggers that ack a verified handshake request (e.g.
// Discord PING → PONG) instead of producing an execution. Kept out of the
// frozen SDK surface — checked duck-typed against the resolved trigger.
interface HandshakeAckTrigger {
  ackHandshake(triggerData: Record<string, unknown>): ValidationResponse | null;
}

function hasHandshakeAck(trigger: unknown): trigger is HandshakeAckTrigger {
  return typeof (trigger as { ackHandshake?: unknown }).ackHandshake === 'function';
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

    // Verified handshake ack (e.g. Discord PING → PONG). Runs only after
    // verifySignature passed, so bad-signature verification probes have already
    // been rejected with 401. A handshake never creates an execution.
    if (hasHandshakeAck(trigger)) {
      const ack = trigger.ackHandshake(triggerData);
      if (ack) {
        this.log.debug(
          { provider: input.provider, subscriptionId: input.subscriptionId },
          'Provider webhook handshake verified and acked',
        );
        return { executionId: '', status: 'ACK', ack };
      }
    }

    // Per-trigger eventType filter (acceptance criteria for #143). If the
    // workflow's trigger-node config narrows to a specific provider event
    // type and the parsed body's event type does not match, ack the webhook
    // (200) without enqueuing execution. Saves jobs for events the workflow
    // doesn't care about.
    const nodeConfig = this.findTriggerNodeConfigInDefinition(
      subscription.workflow.definition,
      subscription.nodeId,
    );
    if (
      !shouldEmitForEventType(input.provider, triggerType, triggerData, nodeConfig ?? undefined)
    ) {
      this.log.debug(
        {
          provider: input.provider,
          subscriptionId: input.subscriptionId,
          workflowId: subscription.workflow.id,
        },
        'Provider webhook accepted but filtered out by eventType — no execution enqueued',
      );
      return { executionId: '', status: 'FILTERED' };
    }

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

  private findTriggerNodeConfigInDefinition(
    definition: Prisma.JsonValue | null,
    nodeId: string,
  ): Record<string, unknown> | null {
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) return null;
    const def = definition as { nodes?: unknown };
    if (!Array.isArray(def.nodes)) return null;
    for (const n of def.nodes) {
      if (!n || typeof n !== 'object' || Array.isArray(n)) continue;
      const node = n as { id?: unknown; config?: unknown };
      if (
        node.id === nodeId &&
        node.config &&
        typeof node.config === 'object' &&
        !Array.isArray(node.config)
      ) {
        return node.config as Record<string, unknown>;
      }
    }
    return null;
  }
}

// Per-provider event-type matchers. Each one extracts a "type" from the inbound
// payload and compares to the trigger node's eventType filter (if set). When
// the node has no filter we always emit. When the node has a filter and the
// payload type doesn't match, we drop the event.
export function shouldEmitForEventType(
  provider: string,
  triggerType: string | null,
  triggerData: Record<string, unknown>,
  nodeConfig?: Record<string, unknown>,
): boolean {
  if (!nodeConfig) return true;
  const filter = nodeConfig.eventType;
  if (typeof filter !== 'string' || filter.length === 0) return true;

  const payloadType = extractPayloadEventType(provider, triggerType, triggerData);
  if (payloadType === null) return true; // Could not classify; don't drop.
  return payloadType === filter;
}

function extractPayloadEventType(
  provider: string,
  triggerType: string | null,
  payload: Record<string, unknown>,
): string | null {
  switch (provider) {
    case 'stripe': {
      const t = (payload as { type?: unknown }).type;
      return typeof t === 'string' ? t : null;
    }
    case 'mailchimp': {
      const t = (payload as { type?: unknown }).type;
      return typeof t === 'string' ? t : null;
    }
    case 'calendly': {
      const t = (payload as { event?: unknown }).event;
      return typeof t === 'string' ? t : null;
    }
    case 'hubspot': {
      // HubSpot sends an array of events; if any matches the filter, emit.
      // The caller's compare-equality semantics make this awkward — here we
      // just return null (don't filter) when the shape is array-of-events,
      // and let the trigger node consume the whole batch.
      const events = (payload as { events?: unknown }).events;
      if (Array.isArray(events) && events.length > 0) {
        const first = events[0] as { subscriptionType?: unknown };
        if (typeof first.subscriptionType === 'string') return first.subscriptionType;
      }
      return null;
    }
    case 'trello': {
      const action = (payload as { action?: { type?: unknown } }).action;
      const t = action && typeof action === 'object' ? action.type : undefined;
      return typeof t === 'string' ? t : null;
    }
    default:
      void triggerType;
      return null;
  }
}
