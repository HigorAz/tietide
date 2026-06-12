import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { EXECUTION_QUEUE_NAME } from '../executions/execution-queue.constants';
import { ProviderTriggerRegistry } from '../provider-triggers/provider-trigger.registry';
import { EntitlementsService } from '../billing/entitlements.service';
import {
  OutlookMessageReceivedTrigger,
  OUTLOOK_MESSAGE_RECEIVED_TYPE,
} from '../provider-triggers/triggers/outlook-message-received.trigger';
import {
  OnedriveFileAddedTrigger,
  ONEDRIVE_FILE_ADDED_TYPE,
} from '../provider-triggers/triggers/onedrive-file-added.trigger';
import { MicrosoftGraphFactory } from '../provider-triggers/triggers/microsoft/microsoft-graph.factory';
import { ProviderWebhooksService } from './provider-webhooks.service';

jest.setTimeout(15000);

/**
 * Integration test for the Microsoft 365 trigger pack: wires the real
 * ProviderWebhooksService + ProviderTriggerRegistry + concrete trigger
 * instances (with a stubbed MicrosoftGraphFactory) and drives inbound
 * Graph notifications through the dispatcher end-to-end.
 *
 * Covers the AC: "integration — full Outlook subscription flow against a
 * fixture mailbox" and the analogous OneDrive flow.
 */
describe('ProviderWebhooksService — Microsoft 365 integration', () => {
  let service: ProviderWebhooksService;
  let registry: ProviderTriggerRegistry;
  let prisma: {
    providerSubscription: { findUnique: jest.Mock };
    workflowExecution: { create: jest.Mock; findFirst: jest.Mock };
  };
  let queue: { add: jest.Mock };
  let crypto: { decrypt: jest.Mock };
  let graphFactory: { graphFetch: jest.Mock };

  const subscriptionId = '11111111-1111-4111-8111-111111111111';
  const workflowId = '22222222-2222-4222-8222-222222222222';
  const userId = '33333333-3333-4333-8333-333333333333';
  const executionId = '44444444-4444-4444-8444-444444444444';

  const outlookSecret = 'outlook-clientstate-32-bytes-aaaa';
  const onedriveSecret = 'onedrive-clientstate-32-bytes-zzzz';

  beforeEach(async () => {
    prisma = {
      providerSubscription: { findUnique: jest.fn() },
      workflowExecution: {
        create: jest.fn(async () => ({
          id: executionId,
          workflowId,
          status: 'PENDING',
        })),
        findFirst: jest.fn(async () => null),
      },
    };
    queue = { add: jest.fn(async () => undefined) };
    crypto = { decrypt: jest.fn() };
    graphFactory = { graphFetch: jest.fn() };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        ProviderWebhooksService,
        ProviderTriggerRegistry,
        OutlookMessageReceivedTrigger,
        OnedriveFileAddedTrigger,
        { provide: MicrosoftGraphFactory, useValue: graphFactory },
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: crypto },
        { provide: getQueueToken(EXECUTION_QUEUE_NAME), useValue: queue },
        { provide: EntitlementsService, useValue: { assertCanRun: jest.fn() } },
      ],
    }).compile();

    service = mod.get(ProviderWebhooksService);
    registry = mod.get(ProviderTriggerRegistry);
    registry.register(OUTLOOK_MESSAGE_RECEIVED_TYPE, mod.get(OutlookMessageReceivedTrigger));
    registry.register(ONEDRIVE_FILE_ADDED_TYPE, mod.get(OnedriveFileAddedTrigger));
  });

  describe('Outlook subscription flow', () => {
    const outlookDefinition = {
      nodes: [
        {
          id: 'outlook-trigger',
          type: 'outlook-message-received',
          config: { connectionId: 'conn-1' },
        },
      ],
      edges: [],
    };

    function activeOutlookSubscription(): unknown {
      return {
        id: subscriptionId,
        workflowId,
        nodeId: 'outlook-trigger',
        provider: 'microsoft',
        providerSubId: 'graph-sub-OUT',
        secretEnc: 'cipher',
        secretNonce: 'nonce',
        // Outlook caps at ~70 hours; renewer rotates every 24 h.
        expiresAt: new Date(Date.now() + 60 * 60 * 60_000),
        workflow: { id: workflowId, userId, isActive: true, definition: outlookDefinition },
      };
    }

    it('verifies clientState on a fixture-mailbox notification and enqueues an execution', async () => {
      prisma.providerSubscription.findUnique.mockResolvedValue(activeOutlookSubscription());
      crypto.decrypt.mockReturnValue(outlookSecret);

      const notificationBody = JSON.stringify({
        value: [
          {
            subscriptionId: 'graph-sub-OUT',
            clientState: outlookSecret,
            changeType: 'created',
            resource: "Users('user@tenant.com')/Messages('AAMkAGI=')",
            resourceData: {
              '@odata.type': '#Microsoft.Graph.Message',
              '@odata.id': "Users('user@tenant.com')/Messages('AAMkAGI=')",
              id: 'AAMkAGI=',
            },
          },
        ],
      });

      const result = await service.trigger({
        provider: 'microsoft',
        subscriptionId,
        rawBody: Buffer.from(notificationBody),
        headers: { 'content-type': 'application/json' },
      });

      expect(crypto.decrypt).toHaveBeenCalledWith('cipher', 'nonce');
      expect(prisma.workflowExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workflowId,
            triggerType: 'provider:microsoft',
            status: 'PENDING',
          }),
        }),
      );
      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ executionId, status: 'PENDING' });
    });

    it('rejects with the uniform 404 when clientState does not match (no existence oracle)', async () => {
      prisma.providerSubscription.findUnique.mockResolvedValue(activeOutlookSubscription());
      crypto.decrypt.mockReturnValue(outlookSecret);

      const notificationBody = JSON.stringify({
        value: [{ clientState: 'wrong-clientstate-32-bytes-bbbb', changeType: 'created' }],
      });

      await expect(
        service.trigger({
          provider: 'microsoft',
          subscriptionId,
          rawBody: Buffer.from(notificationBody),
          headers: { 'content-type': 'application/json' },
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.workflowExecution.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('rejects with 404 when the subscription is missing', async () => {
      prisma.providerSubscription.findUnique.mockResolvedValue(null);

      await expect(
        service.trigger({
          provider: 'microsoft',
          subscriptionId,
          rawBody: Buffer.from('{"value":[]}'),
          headers: {},
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects with 404 when the inbound provider tag mismatches the stored subscription', async () => {
      prisma.providerSubscription.findUnique.mockResolvedValue(activeOutlookSubscription());

      await expect(
        service.trigger({
          provider: 'google', // wrong provider for a microsoft sub
          subscriptionId,
          rawBody: Buffer.from('{"value":[]}'),
          headers: {},
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('OneDrive subscription flow', () => {
    const onedriveDefinition = {
      nodes: [
        {
          id: 'onedrive-trigger',
          type: 'onedrive-file-added',
          config: { connectionId: 'conn-1' },
        },
      ],
      edges: [],
    };

    function activeOnedriveSubscription(): unknown {
      return {
        id: subscriptionId,
        workflowId,
        nodeId: 'onedrive-trigger',
        provider: 'microsoft',
        providerSubId: 'graph-sub-DRIVE',
        secretEnc: 'cipher',
        secretNonce: 'nonce',
        expiresAt: new Date(Date.now() + 28 * 24 * 60 * 60_000),
        workflow: { id: workflowId, userId, isActive: true, definition: onedriveDefinition },
      };
    }

    it('verifies clientState on a drive-root change and enqueues an execution', async () => {
      prisma.providerSubscription.findUnique.mockResolvedValue(activeOnedriveSubscription());
      crypto.decrypt.mockReturnValue(onedriveSecret);

      const notificationBody = JSON.stringify({
        value: [
          {
            subscriptionId: 'graph-sub-DRIVE',
            clientState: onedriveSecret,
            changeType: 'updated',
            resource: 'me/drive/root',
            tenantId: 'tenant-1',
          },
        ],
      });

      const result = await service.trigger({
        provider: 'microsoft',
        subscriptionId,
        rawBody: Buffer.from(notificationBody),
        headers: { 'content-type': 'application/json' },
      });

      expect(result).toEqual({ executionId, status: 'PENDING' });
      expect(queue.add).toHaveBeenCalledTimes(1);
    });
  });

  describe('cross-trigger dispatch', () => {
    it('picks the right trigger when a workflow has both Outlook and OneDrive nodes', async () => {
      const mixed = {
        nodes: [
          {
            id: 'outlook-trigger',
            type: 'outlook-message-received',
            config: { connectionId: 'conn-1' },
          },
          {
            id: 'onedrive-trigger',
            type: 'onedrive-file-added',
            config: { connectionId: 'conn-1' },
          },
        ],
        edges: [],
      };
      prisma.providerSubscription.findUnique.mockResolvedValue({
        id: subscriptionId,
        workflowId,
        // Subscription points at the OneDrive node, so the dispatcher must
        // route to the OneDrive trigger even though both are 'microsoft'.
        nodeId: 'onedrive-trigger',
        provider: 'microsoft',
        providerSubId: 'graph-sub-DRIVE',
        secretEnc: 'cipher',
        secretNonce: 'nonce',
        expiresAt: new Date(Date.now() + 60 * 60_000),
        workflow: { id: workflowId, userId, isActive: true, definition: mixed },
      });
      crypto.decrypt.mockReturnValue(onedriveSecret);

      const notificationBody = JSON.stringify({
        value: [{ clientState: onedriveSecret, changeType: 'updated', resource: 'me/drive/root' }],
      });

      const result = await service.trigger({
        provider: 'microsoft',
        subscriptionId,
        rawBody: Buffer.from(notificationBody),
        headers: {},
      });
      expect(result.executionId).toBe(executionId);
    });
  });
});
