import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { ConnectionsService } from '../connections/connections.service';
import { ProviderTriggerRegistry } from './provider-trigger.registry';
import { ActivationService, PUBLIC_API_URL_TOKEN } from './activation.service';

interface PrismaMock {
  providerSubscription: {
    findMany: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };
  connection: { findFirst: jest.Mock };
  $transaction: jest.Mock;
}

interface CryptoMock {
  encrypt: jest.Mock;
  decrypt: jest.Mock;
}

interface ConnectionsMock {
  decryptConfig: jest.Mock;
}

describe('ActivationService', () => {
  let service: ActivationService;
  let prisma: PrismaMock;
  let crypto: CryptoMock;
  let connections: ConnectionsMock;
  let registry: ProviderTriggerRegistry;
  let pushTrigger: { onActivate: jest.Mock; onDeactivate: jest.Mock; verifySignature: jest.Mock };

  const userId = 'user-1';
  const workflowId = 'wf-1';
  const connectionId = 'conn-1';
  const callbackBase = 'https://api.tietide.dev';

  const definition = {
    nodes: [
      {
        id: 'trigger-node-1',
        type: 'stripe-event-received',
        name: 'Stripe Event',
        position: { x: 0, y: 0 },
        config: { connectionId, events: ['payment_intent.succeeded'] },
      },
      {
        id: 'log-node',
        type: 'log-data',
        name: 'Log',
        position: { x: 200, y: 0 },
        config: {},
      },
    ],
    edges: [],
  } as unknown as Prisma.JsonValue;

  beforeEach(async () => {
    pushTrigger = {
      onActivate: jest.fn(async () => ({
        providerSubId: 'we_111',
        signingSecret: 'whsec_xyz',
      })),
      onDeactivate: jest.fn(async () => undefined),
      verifySignature: jest.fn(),
    };

    prisma = {
      providerSubscription: {
        findMany: jest.fn(async () => []),
        create: jest.fn(async (args: { data: { id?: string } }) => ({
          id: 'new-sub',
          ...args.data,
        })),
        delete: jest.fn(async () => undefined),
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
      connection: {
        findFirst: jest.fn(async () => ({
          id: connectionId,
          userId,
          type: 'API_KEY',
          provider: 'stripe',
          configEncrypted: 'cfg-enc',
          configNonce: 'cfg-nonce',
          refreshTokenEncrypted: null,
          refreshTokenNonce: null,
        })),
      },
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma)),
    };

    crypto = {
      encrypt: jest.fn(() => ({ ciphertext: 'sig-cipher', nonce: 'sig-nonce' })),
      decrypt: jest.fn(),
    };
    connections = {
      decryptConfig: jest.fn(() => ({ apiKey: 'sk_test_xxx' })),
    };
    registry = new ProviderTriggerRegistry();
    registry.register('stripe-event-received', pushTrigger as never);

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        ActivationService,
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: crypto },
        { provide: ConnectionsService, useValue: connections },
        { provide: ProviderTriggerRegistry, useValue: registry },
        { provide: PUBLIC_API_URL_TOKEN, useValue: callbackBase },
      ],
    }).compile();

    service = mod.get(ActivationService);
  });

  describe('activateForWorkflow', () => {
    it('should call onActivate per push trigger node and persist a ProviderSubscription', async () => {
      await service.activateForWorkflow({ workflowId, userId, definition });

      expect(pushTrigger.onActivate).toHaveBeenCalledTimes(1);
      const args = pushTrigger.onActivate.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(args).toEqual(
        expect.objectContaining({
          workflowId,
          nodeId: 'trigger-node-1',
          callbackUrl: expect.stringContaining('/v1/provider-webhooks/stripe/'),
          config: expect.objectContaining({ events: ['payment_intent.succeeded'] }),
        }),
      );

      expect(crypto.encrypt).toHaveBeenCalledWith('whsec_xyz');
      expect(prisma.providerSubscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workflowId,
            nodeId: 'trigger-node-1',
            provider: 'stripe',
            providerSubId: 'we_111',
            secretEnc: 'sig-cipher',
            secretNonce: 'sig-nonce',
          }),
        }),
      );
    });

    it('should propagate provider error so the surrounding transaction rolls back', async () => {
      pushTrigger.onActivate.mockRejectedValueOnce(new Error('Stripe down'));

      await expect(service.activateForWorkflow({ workflowId, userId, definition })).rejects.toThrow(
        'Stripe down',
      );

      expect(prisma.providerSubscription.create).not.toHaveBeenCalled();
    });

    it('should be a no-op when the definition has no push trigger nodes', async () => {
      const plain = {
        nodes: [
          {
            id: 'manual',
            type: 'manual-trigger',
            name: 'Manual',
            position: { x: 0, y: 0 },
            config: {},
          },
        ],
        edges: [],
      } as unknown as Prisma.JsonValue;

      await service.activateForWorkflow({ workflowId, userId, definition: plain });
      expect(pushTrigger.onActivate).not.toHaveBeenCalled();
      expect(prisma.providerSubscription.create).not.toHaveBeenCalled();
    });

    it('should throw when push trigger node config has no connectionId', async () => {
      const noConn = {
        nodes: [
          {
            id: 'trigger-node-1',
            type: 'stripe-event-received',
            name: 'Stripe',
            position: { x: 0, y: 0 },
            config: {},
          },
        ],
        edges: [],
      } as unknown as Prisma.JsonValue;

      await expect(
        service.activateForWorkflow({ workflowId, userId, definition: noConn }),
      ).rejects.toThrow(/connectionId/i);
    });

    it('should throw when the connection does not belong to the workflow owner', async () => {
      prisma.connection.findFirst.mockResolvedValueOnce(null);

      await expect(service.activateForWorkflow({ workflowId, userId, definition })).rejects.toThrow(
        /connection/i,
      );
    });
  });

  describe('deactivateForWorkflow', () => {
    it('should call onDeactivate per existing subscription and delete each row', async () => {
      prisma.providerSubscription.findMany.mockResolvedValueOnce([
        {
          id: 'sub-1',
          workflowId,
          nodeId: 'trigger-node-1',
          provider: 'stripe',
          providerSubId: 'we_111',
          secretEnc: 'sig-cipher',
          secretNonce: 'sig-nonce',
        },
      ]);

      await service.deactivateForWorkflow({ workflowId, userId, definition });

      expect(pushTrigger.onDeactivate).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId,
          nodeId: 'trigger-node-1',
          providerSubId: 'we_111',
        }),
      );
      expect(prisma.providerSubscription.delete).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
      });
    });

    it('should still delete the row when onDeactivate throws (best-effort cleanup)', async () => {
      prisma.providerSubscription.findMany.mockResolvedValueOnce([
        {
          id: 'sub-1',
          workflowId,
          nodeId: 'trigger-node-1',
          provider: 'stripe',
          providerSubId: 'we_dead',
          secretEnc: 'sig-cipher',
          secretNonce: 'sig-nonce',
        },
      ]);
      pushTrigger.onDeactivate.mockRejectedValueOnce(new Error('provider unreachable'));

      await service.deactivateForWorkflow({ workflowId, userId, definition });

      expect(prisma.providerSubscription.delete).toHaveBeenCalled();
    });

    it('should be a no-op when there are no existing subscriptions', async () => {
      prisma.providerSubscription.findMany.mockResolvedValueOnce([]);

      await service.deactivateForWorkflow({ workflowId, userId, definition });

      expect(pushTrigger.onDeactivate).not.toHaveBeenCalled();
      expect(prisma.providerSubscription.delete).not.toHaveBeenCalled();
    });
  });
});
