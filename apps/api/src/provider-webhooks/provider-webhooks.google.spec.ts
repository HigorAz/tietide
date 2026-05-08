import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { EXECUTION_QUEUE_NAME } from '../executions/execution-queue.constants';
import { ProviderTriggerRegistry } from '../provider-triggers/provider-trigger.registry';
import {
  DriveFileAddedTrigger,
  DRIVE_FILE_ADDED_TYPE,
} from '../provider-triggers/triggers/drive-file-added.trigger';
import {
  GmailMessageReceivedTrigger,
  GMAIL_MESSAGE_RECEIVED_TYPE,
} from '../provider-triggers/triggers/gmail-message-received.trigger';
import { GoogleClientFactory } from '../provider-triggers/triggers/google/google-client.factory';
import { ProviderWebhooksService } from './provider-webhooks.service';

/**
 * Integration test that wires the real ProviderTriggerRegistry, real
 * DriveFileAddedTrigger / GmailMessageReceivedTrigger instances (with
 * mocked Google clients), and ProviderWebhooksService, then drives
 * inbound webhook calls through the dispatcher end-to-end.
 *
 * Covers the AC: "integration — full Drive watch flow against a fixture
 * file upload" + Gmail OIDC delivery.
 */
describe('ProviderWebhooksService — Google integration', () => {
  let service: ProviderWebhooksService;
  let registry: ProviderTriggerRegistry;
  let prisma: {
    providerSubscription: { findUnique: jest.Mock };
    workflowExecution: { create: jest.Mock };
  };
  let queue: { add: jest.Mock };
  let crypto: { decrypt: jest.Mock };
  let googleFactory: { drive: jest.Mock; gmail: jest.Mock; verifyOidcToken: jest.Mock };

  const subscriptionId = '11111111-1111-4111-8111-111111111111';
  const workflowId = '22222222-2222-4222-8222-222222222222';
  const userId = '33333333-3333-4333-8333-333333333333';
  const executionId = '44444444-4444-4444-8444-444444444444';

  const driveSecret = 'channel-token-32-bytes-of-random!';
  const gmailCallback = 'https://api.tietide.dev/v1/provider-webhooks/google/' + subscriptionId;

  beforeEach(async () => {
    prisma = {
      providerSubscription: { findUnique: jest.fn() },
      workflowExecution: {
        create: jest.fn(async () => ({
          id: executionId,
          workflowId,
          status: 'PENDING',
        })),
      },
    };
    queue = { add: jest.fn(async () => undefined) };
    crypto = { decrypt: jest.fn() };
    googleFactory = {
      drive: jest.fn(),
      gmail: jest.fn(),
      verifyOidcToken: jest.fn(),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        ProviderWebhooksService,
        ProviderTriggerRegistry,
        DriveFileAddedTrigger,
        GmailMessageReceivedTrigger,
        { provide: GoogleClientFactory, useValue: googleFactory },
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: crypto },
        { provide: getQueueToken(EXECUTION_QUEUE_NAME), useValue: queue },
      ],
    }).compile();

    service = mod.get(ProviderWebhooksService);
    registry = mod.get(ProviderTriggerRegistry);
    registry.register(DRIVE_FILE_ADDED_TYPE, mod.get(DriveFileAddedTrigger));
    registry.register(GMAIL_MESSAGE_RECEIVED_TYPE, mod.get(GmailMessageReceivedTrigger));
  });

  describe('Drive watch flow', () => {
    const definition = {
      nodes: [
        {
          id: 'drive-trigger',
          type: 'drive-file-added',
          config: { connectionId: 'conn-1', parentFolderId: 'folder-A' },
        },
      ],
      edges: [],
    };

    function activeDriveSubscription(): unknown {
      return {
        id: subscriptionId,
        workflowId,
        nodeId: 'drive-trigger',
        provider: 'google',
        providerSubId: 'channel-uuid|resource-abc',
        secretEnc: 'cipher',
        secretNonce: 'nonce',
        expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
        workflow: { id: workflowId, userId, isActive: true, definition },
      };
    }

    it('routes the inbound Drive notification, verifies the channel token, and enqueues an execution', async () => {
      prisma.providerSubscription.findUnique.mockResolvedValue(activeDriveSubscription());
      crypto.decrypt.mockReturnValue(driveSecret);

      const result = await service.trigger({
        provider: 'google',
        subscriptionId,
        rawBody: Buffer.from(''),
        headers: {
          'x-goog-channel-id': 'channel-uuid',
          'x-goog-resource-id': 'resource-abc',
          'x-goog-channel-token': driveSecret,
          'x-goog-resource-state': 'change',
        },
      });

      expect(crypto.decrypt).toHaveBeenCalledWith('cipher', 'nonce');
      expect(prisma.workflowExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workflowId,
            triggerType: 'provider:google',
            status: 'PENDING',
          }),
        }),
      );
      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ executionId, status: 'PENDING' });
    });

    it('rejects with 401 when the X-Goog-Channel-Token does not match', async () => {
      prisma.providerSubscription.findUnique.mockResolvedValue(activeDriveSubscription());
      crypto.decrypt.mockReturnValue(driveSecret);

      await expect(
        service.trigger({
          provider: 'google',
          subscriptionId,
          rawBody: Buffer.from(''),
          headers: { 'x-goog-channel-token': 'wrong-token-of-similar-length-XX' },
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.workflowExecution.create).not.toHaveBeenCalled();
    });

    it('rejects with 404 when the subscription is missing', async () => {
      prisma.providerSubscription.findUnique.mockResolvedValue(null);

      await expect(
        service.trigger({
          provider: 'google',
          subscriptionId,
          rawBody: Buffer.from(''),
          headers: { 'x-goog-channel-token': driveSecret },
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('Gmail Pub/Sub flow', () => {
    const definition = {
      nodes: [
        {
          id: 'gmail-trigger',
          type: 'gmail-message-received',
          config: {
            connectionId: 'conn-1',
            topicName: 'projects/p/topics/gmail-watch',
          },
        },
      ],
      edges: [],
    };

    function activeGmailSubscription(): unknown {
      return {
        id: subscriptionId,
        workflowId,
        nodeId: 'gmail-trigger',
        provider: 'google',
        providerSubId: '900',
        secretEnc: 'cipher',
        secretNonce: 'nonce',
        expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
        workflow: { id: workflowId, userId, isActive: true, definition },
      };
    }

    it('verifies the OIDC ID token and enqueues an execution', async () => {
      prisma.providerSubscription.findUnique.mockResolvedValue(activeGmailSubscription());
      crypto.decrypt.mockReturnValue(`${gmailCallback}::oidc`);
      googleFactory.verifyOidcToken.mockResolvedValue({
        email: 'gmail-api-push@system.gserviceaccount.com',
        email_verified: true,
        aud: gmailCallback,
      });

      const result = await service.trigger({
        provider: 'google',
        subscriptionId,
        rawBody: Buffer.from(
          JSON.stringify({
            message: {
              data: Buffer.from(
                JSON.stringify({ emailAddress: 'user@example.com', historyId: '950' }),
              ).toString('base64'),
              messageId: 'pubsub-msg-1',
            },
            subscription: 'projects/p/subscriptions/s',
          }),
        ),
        headers: { authorization: 'Bearer fake.jwt.signature' },
      });

      expect(googleFactory.verifyOidcToken).toHaveBeenCalledWith(
        'fake.jwt.signature',
        gmailCallback,
      );
      expect(result).toEqual({ executionId, status: 'PENDING' });
      expect(queue.add).toHaveBeenCalledTimes(1);
    });

    it('rejects with 401 when the OIDC verification fails', async () => {
      prisma.providerSubscription.findUnique.mockResolvedValue(activeGmailSubscription());
      crypto.decrypt.mockReturnValue(`${gmailCallback}::oidc`);
      googleFactory.verifyOidcToken.mockRejectedValue(new Error('Invalid signature'));

      await expect(
        service.trigger({
          provider: 'google',
          subscriptionId,
          rawBody: Buffer.from('{}'),
          headers: { authorization: 'Bearer aaa.bbb.ccc' },
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.workflowExecution.create).not.toHaveBeenCalled();
    });

    it("rejects with 401 when the OIDC email is not Gmail's push service account", async () => {
      prisma.providerSubscription.findUnique.mockResolvedValue(activeGmailSubscription());
      crypto.decrypt.mockReturnValue(`${gmailCallback}::oidc`);
      googleFactory.verifyOidcToken.mockResolvedValue({
        email: 'attacker@example.com',
        email_verified: true,
        aud: gmailCallback,
      });

      await expect(
        service.trigger({
          provider: 'google',
          subscriptionId,
          rawBody: Buffer.from('{}'),
          headers: { authorization: 'Bearer aaa.bbb.ccc' },
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('cross-trigger dispatch', () => {
    it('routes correctly when a workflow has both Drive and Gmail trigger nodes', async () => {
      const definition = {
        nodes: [
          {
            id: 'drive-trigger',
            type: 'drive-file-added',
            config: { connectionId: 'conn-1', parentFolderId: 'folder-A' },
          },
          {
            id: 'gmail-trigger',
            type: 'gmail-message-received',
            config: {
              connectionId: 'conn-1',
              topicName: 'projects/p/topics/gmail-watch',
            },
          },
        ],
        edges: [],
      };
      prisma.providerSubscription.findUnique.mockResolvedValue({
        id: subscriptionId,
        workflowId,
        nodeId: 'drive-trigger', // <-- subscription points to the Drive node
        provider: 'google',
        providerSubId: 'channel-uuid|resource-abc',
        secretEnc: 'cipher',
        secretNonce: 'nonce',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        workflow: { id: workflowId, userId, isActive: true, definition },
      });
      crypto.decrypt.mockReturnValue(driveSecret);

      // We send a Drive token; the dispatcher must pick the Drive trigger
      // (not Gmail) because the subscription's nodeId resolves to the Drive
      // trigger in the workflow definition.
      const result = await service.trigger({
        provider: 'google',
        subscriptionId,
        rawBody: Buffer.from(''),
        headers: { 'x-goog-channel-token': driveSecret },
      });
      expect(result.executionId).toBe(executionId);
      expect(googleFactory.verifyOidcToken).not.toHaveBeenCalled();
    });
  });
});
