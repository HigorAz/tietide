import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { EXECUTION_QUEUE_NAME } from '../executions/execution-queue.constants';
import { ProviderTriggerRegistry } from '../provider-triggers/provider-trigger.registry';
import { EntitlementsService } from '../billing/entitlements.service';
import {
  OutlookMessageReceivedTrigger,
  OUTLOOK_MESSAGE_RECEIVED_TYPE,
} from '../provider-triggers/triggers/outlook-message-received.trigger';
import { MicrosoftGraphFactory } from '../provider-triggers/triggers/microsoft/microsoft-graph.factory';
import { ProviderWebhooksService } from './provider-webhooks.service';

jest.setTimeout(15000);

/**
 * Regression guard for W5.32: the Microsoft change-notification idempotency key
 * must be anchored on a per-notification natural key (the value[].resourceData.id
 * + changeType), NOT on a full-body hash. The previous fallback collapsed
 * distinct events whose envelopes serialized similarly; this asserts that two
 * Graph notifications differing in their per-item resourceData.id derive
 * DISTINCT idempotency keys so the second event is not deduped away.
 */
describe('ProviderWebhooksService — Microsoft idempotency key (W5.32)', () => {
  let service: ProviderWebhooksService;
  let registry: ProviderTriggerRegistry;
  let prisma: {
    providerSubscription: { findUnique: jest.Mock };
    workflowExecution: { create: jest.Mock; findFirst: jest.Mock };
  };
  let queue: { add: jest.Mock };
  let crypto: { decrypt: jest.Mock };

  const subscriptionId = '11111111-1111-4111-8111-111111111111';
  const workflowId = '22222222-2222-4222-8222-222222222222';
  const userId = '33333333-3333-4333-8333-333333333333';
  const secret = 'outlook-clientstate-32-bytes-aaaa';

  const definition = {
    nodes: [
      { id: 'outlook-trigger', type: 'outlook-message-received', config: { connectionId: 'c1' } },
    ],
    edges: [],
  };

  function activeSubscription(): unknown {
    return {
      id: subscriptionId,
      workflowId,
      nodeId: 'outlook-trigger',
      provider: 'microsoft',
      providerSubId: 'graph-sub-OUT',
      secretEnc: 'cipher',
      secretNonce: 'nonce',
      expiresAt: new Date(Date.now() + 60 * 60 * 60_000),
      workflow: { id: workflowId, userId, organizationId: 'org-1', isActive: true, definition },
    };
  }

  function outlookBodyForItem(itemId: string): Buffer {
    return Buffer.from(
      JSON.stringify({
        value: [
          {
            subscriptionId: 'graph-sub-OUT',
            clientState: secret,
            changeType: 'created',
            resource: `Users('user@tenant.com')/Messages('${itemId}')`,
            resourceData: {
              '@odata.type': '#Microsoft.Graph.Message',
              '@odata.id': `Users('user@tenant.com')/Messages('${itemId}')`,
              id: itemId,
            },
          },
        ],
      }),
    );
  }

  beforeEach(async () => {
    const created: Array<{ id: string; idempotencyKey: string }> = [];
    prisma = {
      providerSubscription: { findUnique: jest.fn() },
      workflowExecution: {
        create: jest.fn(async ({ data }: { data: { idempotencyKey: string } }) => {
          const id = `exec-${created.length + 1}`;
          created.push({ id, idempotencyKey: data.idempotencyKey });
          return { id };
        }),
        // Dedup mirror: a key already persisted by a prior create short-circuits.
        findFirst: jest.fn(async ({ where }: { where: { idempotencyKey: string } }) => {
          const hit = created.find((c) => c.idempotencyKey === where.idempotencyKey);
          return hit ? { id: hit.id, status: 'PENDING' } : null;
        }),
      },
    };
    queue = { add: jest.fn(async () => undefined) };
    crypto = { decrypt: jest.fn(() => secret) };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        ProviderWebhooksService,
        ProviderTriggerRegistry,
        OutlookMessageReceivedTrigger,
        { provide: MicrosoftGraphFactory, useValue: { graphFetch: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: crypto },
        { provide: getQueueToken(EXECUTION_QUEUE_NAME), useValue: queue },
        { provide: EntitlementsService, useValue: { assertCanRun: jest.fn() } },
      ],
    }).compile();

    service = mod.get(ProviderWebhooksService);
    registry = mod.get(ProviderTriggerRegistry);
    registry.register(OUTLOOK_MESSAGE_RECEIVED_TYPE, mod.get(OutlookMessageReceivedTrigger));
    prisma.providerSubscription.findUnique.mockResolvedValue(activeSubscription());
  });

  it('derives DISTINCT idempotency keys for two notifications with different resourceData.id', async () => {
    await service.trigger({
      provider: 'microsoft',
      subscriptionId,
      rawBody: outlookBodyForItem('AAA='),
      headers: {},
    });
    await service.trigger({
      provider: 'microsoft',
      subscriptionId,
      rawBody: outlookBodyForItem('BBB='),
      headers: {},
    });

    // Both distinct events must create a row (the second is NOT deduped).
    expect(prisma.workflowExecution.create).toHaveBeenCalledTimes(2);
    const keys = prisma.workflowExecution.create.mock.calls.map(
      (c: [{ data: { idempotencyKey: string } }]) => c[0].data.idempotencyKey,
    );
    expect(keys[0]).not.toEqual(keys[1]);
    // Key must be anchored on the natural per-item id, not a full-body hash.
    expect(keys[0]).not.toMatch(/^provider:microsoft:body:/);
    expect(keys[1]).not.toMatch(/^provider:microsoft:body:/);
    expect(keys[0]).toMatch(/^provider:microsoft:/);
  });

  it('dedups a true redelivery (byte-identical notification) of the same event', async () => {
    const body = outlookBodyForItem('SAME=');
    const first = await service.trigger({
      provider: 'microsoft',
      subscriptionId,
      rawBody: body,
      headers: {},
    });
    const second = await service.trigger({
      provider: 'microsoft',
      subscriptionId,
      rawBody: body,
      headers: {},
    });

    expect(prisma.workflowExecution.create).toHaveBeenCalledTimes(1);
    expect(second.executionId).toBe(first.executionId);
  });
});
