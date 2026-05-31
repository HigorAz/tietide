import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { createHash } from 'crypto';
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
  // Server-parsed query string of the inbound request. Used by URL-secret
  // providers (Mailchimp) to verify a trusted value rather than a client header.
  query?: Record<string, string | string[] | undefined>;
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

// Structural opt-in for triggers that produce an immediate provider response for
// a real (verified, enqueued) event — e.g. Discord must reply to a slash command
// within ~3s. Unlike ackHandshake, the execution is still created/enqueued.
interface InteractionResponder {
  interactionResponse(
    triggerData: Record<string, unknown>,
    opts: { hasReplyAction: boolean },
  ): ValidationResponse | null;
}

function hasInteractionResponse(trigger: unknown): trigger is InteractionResponder {
  return typeof (trigger as { interactionResponse?: unknown }).interactionResponse === 'function';
}

// The Discord reply action node type — its presence in the workflow definition
// decides whether the webhook defers (type 5) or acks immediately (type 4).
const DISCORD_REPLY_NODE_TYPE = 'discord-reply-to-command';

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
        query: input.query ?? {},
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

    // Provider deliveries are at-least-once: a slow/non-2xx response makes the
    // provider redeliver the SAME event. Derive a stable idempotency key per
    // event so a redelivery does not spawn a duplicate workflow run (duplicate
    // charge/message/record). Dedup is scoped per workflow via the
    // @@unique([workflowId, idempotencyKey]) constraint.
    const idempotencyKey = this.deriveIdempotencyKey(
      input.provider,
      input.headers,
      triggerData,
      input.rawBody,
    );

    const existing = await this.prisma.workflowExecution.findFirst({
      where: { workflowId: subscription.workflow.id, idempotencyKey },
      select: { id: true, status: true },
    });
    if (existing) {
      this.log.log(
        {
          provider: input.provider,
          subscriptionId: input.subscriptionId,
          workflowId: subscription.workflow.id,
          idempotencyKey,
        },
        'Duplicate provider delivery, skipping (idempotency key already seen)',
      );
      return { executionId: existing.id, status: existing.status };
    }

    let created: { id: string };
    try {
      created = await this.prisma.workflowExecution.create({
        data: {
          workflowId: subscription.workflow.id,
          status: 'PENDING',
          triggerType: executionTriggerType,
          triggerData: triggerData as Prisma.InputJsonValue,
          idempotencyKey,
        },
        select: { id: true },
      });
    } catch (err) {
      // Concurrent redelivery raced us to the unique constraint — treat as a
      // duplicate and return the row the other request created.
      if (this.isUniqueViolation(err)) {
        const dup = await this.prisma.workflowExecution.findFirst({
          where: { workflowId: subscription.workflow.id, idempotencyKey },
          select: { id: true, status: true },
        });
        if (dup) return { executionId: dup.id, status: dup.status };
      }
      throw err;
    }

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

    // Immediate provider response for interaction-style providers (Discord must
    // reply to a slash command within ~3s). The execution above still runs; this
    // only shapes the synchronous HTTP reply. Defers when the workflow has a
    // reply action, otherwise acks the command outright.
    if (hasInteractionResponse(trigger)) {
      const hasReplyAction = this.definitionHasNodeType(
        subscription.workflow.definition,
        DISCORD_REPLY_NODE_TYPE,
      );
      const ack = trigger.interactionResponse(triggerData, { hasReplyAction });
      if (ack) {
        return { executionId: created.id, status: 'PENDING', ack };
      }
    }

    return { executionId: created.id, status: 'PENDING' };
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: unknown }).code === 'P2002'
    );
  }

  // Stable per-event idempotency key. Prefers the provider's own event id
  // (the most reliable dedup anchor); falls back to a hash of the raw body,
  // which is byte-identical across provider redeliveries of the same event.
  private deriveIdempotencyKey(
    provider: string,
    headers: Record<string, string | string[] | undefined>,
    triggerData: Record<string, unknown>,
    rawBody: Buffer,
  ): string {
    const natural = this.extractProviderEventId(provider, headers, triggerData);
    const basis =
      natural ?? `body:${createHash('sha256').update(rawBody).digest('hex').slice(0, 32)}`;
    return `provider:${provider}:${basis}`;
  }

  private extractProviderEventId(
    provider: string,
    headers: Record<string, string | string[] | undefined>,
    data: Record<string, unknown>,
  ): string | null {
    const str = (v: unknown): string | null =>
      typeof v === 'string' && v.length > 0 ? v : typeof v === 'number' ? String(v) : null;
    const header = (name: string): string | null => {
      const v = headers[name];
      return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
    };
    switch (provider) {
      case 'stripe':
        return str(data.id); // event.id (evt_...)
      case 'github':
        return header('x-github-delivery'); // delivery GUID
      case 'slack':
        return str(data.event_id);
      case 'discord-bot':
        return str(data.id); // interaction id
      case 'telegram':
        return str(data.update_id);
      case 'twilio':
        return str(data.MessageSid) ?? str(data.SmsSid);
      case 'trello': {
        const action = data.action as { id?: unknown } | undefined;
        return action ? str(action.id) : null;
      }
      case 'hubspot': {
        const events = data.events;
        if (Array.isArray(events) && events.length > 0) {
          return str((events[0] as { eventId?: unknown }).eventId);
        }
        return null;
      }
      default:
        return null; // mailchimp/calendly/google/microsoft → body-hash fallback
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

  private definitionHasNodeType(definition: Prisma.JsonValue | null, nodeType: string): boolean {
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) return false;
    const def = definition as { nodes?: unknown };
    if (!Array.isArray(def.nodes)) return false;
    return def.nodes.some(
      (n) =>
        n &&
        typeof n === 'object' &&
        !Array.isArray(n) &&
        (n as { type?: unknown }).type === nodeType,
    );
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
  // GitHub repo webhooks deliver every action for a subscribed event
  // (opened / closed / edited / reopened …). The *-opened trigger types only
  // fire on `action === 'opened'`, regardless of any node-level filter.
  if (triggerType === 'github-issue-opened' || triggerType === 'github-pr-opened') {
    return (triggerData as { action?: unknown }).action === 'opened';
  }

  // stripe-invoice-paid is a filtered variant of stripe-event-received: even though
  // activation pins the endpoint to invoice.paid, guard delivery to that type so a
  // shared/legacy endpoint can't leak other events into this trigger.
  if (triggerType === 'stripe-invoice-paid') {
    return (triggerData as { type?: unknown }).type === 'invoice.paid';
  }

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
