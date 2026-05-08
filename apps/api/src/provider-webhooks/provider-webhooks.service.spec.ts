import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { EXECUTION_QUEUE_NAME } from '../executions/execution-queue.constants';
import { ProviderTriggerRegistry } from '../provider-triggers/provider-trigger.registry';
import { ProviderWebhooksService } from './provider-webhooks.service';

interface PrismaMock {
  providerSubscription: { findUnique: jest.Mock };
  workflowExecution: { create: jest.Mock };
}
interface QueueMock {
  add: jest.Mock;
}
interface CryptoMock {
  decrypt: jest.Mock;
}
interface RegistryMock {
  getByProvider: jest.Mock;
  getByType: jest.Mock;
}

describe('ProviderWebhooksService', () => {
  let service: ProviderWebhooksService;
  let prisma: PrismaMock;
  let queue: QueueMock;
  let crypto: CryptoMock;
  let registry: RegistryMock;
  let trigger: { verifySignature: jest.Mock; type: string };

  const subscriptionId = 'sub-uuid';
  const workflowId = 'wf-uuid';
  const userId = 'user-uuid';
  const executionId = 'exec-uuid';
  const signingSecret = 'whsec_test';

  function activeSubscription(active = true): unknown {
    return {
      id: subscriptionId,
      workflowId,
      nodeId: 'trigger-node',
      provider: 'stripe',
      providerSubId: 'we_123',
      secretEnc: 'cipher',
      secretNonce: 'nonce',
      expiresAt: null,
      workflow: {
        id: workflowId,
        userId,
        isActive: active,
        definition: {
          nodes: [{ id: 'trigger-node', type: 'stripe-event-received', config: {} }],
          edges: [],
        },
      },
    };
  }

  beforeEach(async () => {
    prisma = {
      providerSubscription: { findUnique: jest.fn() },
      workflowExecution: { create: jest.fn() },
    };
    queue = { add: jest.fn(async () => undefined) };
    crypto = { decrypt: jest.fn(() => signingSecret) };
    trigger = { verifySignature: jest.fn(() => true), type: 'stripe-event-received' };
    registry = {
      getByProvider: jest.fn(() => trigger),
      getByType: jest.fn(() => trigger),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        ProviderWebhooksService,
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: crypto },
        { provide: ProviderTriggerRegistry, useValue: registry },
        { provide: getQueueToken(EXECUTION_QUEUE_NAME), useValue: queue },
      ],
    }).compile();

    service = mod.get(ProviderWebhooksService);
  });

  describe('trigger', () => {
    it('should create execution and enqueue when signature verifies', async () => {
      prisma.providerSubscription.findUnique.mockResolvedValue(activeSubscription());
      prisma.workflowExecution.create.mockResolvedValue({
        id: executionId,
        workflowId,
        status: 'PENDING',
        triggerType: 'provider:stripe',
        triggerData: { type: 'payment_intent.succeeded' },
      });

      const result = await service.trigger({
        provider: 'stripe',
        subscriptionId,
        rawBody: Buffer.from(JSON.stringify({ type: 'payment_intent.succeeded' })),
        headers: { 'stripe-signature': 't=1,v1=abc' },
      });

      expect(crypto.decrypt).toHaveBeenCalledWith('cipher', 'nonce');
      expect(trigger.verifySignature).toHaveBeenCalledWith({
        rawBody: expect.any(Buffer),
        headers: { 'stripe-signature': 't=1,v1=abc' },
        signingSecret,
      });
      expect(prisma.workflowExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workflowId,
            triggerType: 'provider:stripe',
            status: 'PENDING',
          }),
        }),
      );
      expect(queue.add).toHaveBeenCalledWith(
        'execute',
        expect.objectContaining({
          executionId,
          workflowId,
          userId,
          triggerType: 'provider:stripe',
        }),
        expect.objectContaining({ jobId: executionId }),
      );
      expect(result).toEqual({ executionId, status: 'PENDING' });
    });

    it('should throw NotFoundException when subscription does not exist', async () => {
      prisma.providerSubscription.findUnique.mockResolvedValue(null);

      await expect(
        service.trigger({
          provider: 'stripe',
          subscriptionId,
          rawBody: Buffer.from('{}'),
          headers: {},
        }),
      ).rejects.toThrow(NotFoundException);
      expect(trigger.verifySignature).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when workflow is inactive', async () => {
      prisma.providerSubscription.findUnique.mockResolvedValue(activeSubscription(false));

      await expect(
        service.trigger({
          provider: 'stripe',
          subscriptionId,
          rawBody: Buffer.from('{}'),
          headers: {},
        }),
      ).rejects.toThrow(NotFoundException);
      expect(trigger.verifySignature).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when path provider does not match stored provider', async () => {
      prisma.providerSubscription.findUnique.mockResolvedValue(activeSubscription());

      await expect(
        service.trigger({
          provider: 'github',
          subscriptionId,
          rawBody: Buffer.from('{}'),
          headers: {},
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when no trigger is registered for the type in the workflow definition', async () => {
      prisma.providerSubscription.findUnique.mockResolvedValue(activeSubscription());
      registry.getByType.mockReturnValue(null);

      await expect(
        service.trigger({
          provider: 'stripe',
          subscriptionId,
          rawBody: Buffer.from('{}'),
          headers: {},
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw UnauthorizedException when signature verification fails', async () => {
      prisma.providerSubscription.findUnique.mockResolvedValue(activeSubscription());
      trigger.verifySignature.mockReturnValue(false);

      await expect(
        service.trigger({
          provider: 'stripe',
          subscriptionId,
          rawBody: Buffer.from('{}'),
          headers: {},
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.workflowExecution.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('should reject empty body without crashing when signature passes', async () => {
      prisma.providerSubscription.findUnique.mockResolvedValue(activeSubscription());
      prisma.workflowExecution.create.mockResolvedValue({
        id: executionId,
        workflowId,
        status: 'PENDING',
      });

      await service.trigger({
        provider: 'stripe',
        subscriptionId,
        rawBody: Buffer.alloc(0),
        headers: {},
      });

      const payload = queue.add.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(payload.triggerData).toEqual({});
    });
  });
});
