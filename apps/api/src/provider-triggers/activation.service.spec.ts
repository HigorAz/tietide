import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { ConnectionsService } from '../connections/connections.service';
import { ProviderTriggerRegistry } from './provider-trigger.registry';
import {
  ActivationService,
  PUBLIC_API_URL_TOKEN,
  stableSubscriptionId,
} from './activation.service';

interface PrismaMock {
  providerSubscription: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    upsert: jest.Mock;
    update: jest.Mock;
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
  const organizationId = 'org-1';
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
        findUnique: jest.fn(async () => null),
        create: jest.fn(async (args: { data: { id?: string } }) => ({
          id: 'new-sub',
          ...args.data,
        })),
        upsert: jest.fn(async (args: { create: { id?: string } }) => ({
          id: args.create?.id ?? 'new-sub',
          ...args.create,
        })),
        update: jest.fn(async (args: { data: Record<string, unknown> }) => ({
          id: 'sub-1',
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
      await service.activateForWorkflow({ workflowId, organizationId, userId, definition });

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
      const expectedId = stableSubscriptionId(workflowId, 'trigger-node-1');
      // callbackUrl must embed the deterministic id
      expect(args.callbackUrl).toBe(`${callbackBase}/v1/provider-webhooks/stripe/${expectedId}`);
      expect(prisma.providerSubscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workflowId_nodeId: { workflowId, nodeId: 'trigger-node-1' } },
          create: expect.objectContaining({
            id: expectedId,
            workflowId,
            nodeId: 'trigger-node-1',
            provider: 'stripe',
            providerSubId: 'we_111',
            secretEnc: 'sig-cipher',
            secretNonce: 'sig-nonce',
          }),
          update: expect.objectContaining({ id: expectedId, providerSubId: 'we_111' }),
        }),
      );
    });

    it('should use a deterministic id that is stable across re-activations', async () => {
      const a = stableSubscriptionId(workflowId, 'trigger-node-1');
      const b = stableSubscriptionId(workflowId, 'trigger-node-1');
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      // different node → different id
      expect(stableSubscriptionId(workflowId, 'other-node')).not.toBe(a);
      // different workflow → different id
      expect(stableSubscriptionId('wf-2', 'trigger-node-1')).not.toBe(a);
    });

    it('should propagate provider error so the surrounding transaction rolls back', async () => {
      pushTrigger.onActivate.mockRejectedValueOnce(new Error('Stripe down'));

      await expect(
        service.activateForWorkflow({ workflowId, organizationId, userId, definition }),
      ).rejects.toThrow('Stripe down');

      expect(prisma.providerSubscription.upsert).not.toHaveBeenCalled();
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

      await service.activateForWorkflow({ workflowId, organizationId, userId, definition: plain });
      expect(pushTrigger.onActivate).not.toHaveBeenCalled();
      expect(prisma.providerSubscription.upsert).not.toHaveBeenCalled();
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
        service.activateForWorkflow({ workflowId, organizationId, userId, definition: noConn }),
      ).rejects.toThrow(/connectionId/i);
    });

    it('should throw when the connection does not belong to the workflow owner', async () => {
      prisma.connection.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.activateForWorkflow({ workflowId, organizationId, userId, definition }),
      ).rejects.toThrow(/connection/i);
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

      await service.deactivateForWorkflow({ workflowId, organizationId, userId, definition });

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

      await service.deactivateForWorkflow({ workflowId, organizationId, userId, definition });

      expect(prisma.providerSubscription.delete).toHaveBeenCalled();
    });

    it('should be a no-op when there are no existing subscriptions', async () => {
      prisma.providerSubscription.findMany.mockResolvedValueOnce([]);

      await service.deactivateForWorkflow({ workflowId, organizationId, userId, definition });

      expect(pushTrigger.onDeactivate).not.toHaveBeenCalled();
      expect(prisma.providerSubscription.delete).not.toHaveBeenCalled();
    });
  });

  describe('renewSubscription — Microsoft Graph rotation', () => {
    // Microsoft Graph caps mail subscriptions at ~70 hours; the renewer needs
    // to call onDeactivate + onActivate well before that and update the row.
    // We register a Microsoft trigger here and assert the full rotation path.

    const microsoftDefinition = {
      nodes: [
        {
          id: 'trigger-node-1',
          type: 'outlook-message-received',
          name: 'Outlook',
          position: { x: 0, y: 0 },
          config: { connectionId },
        },
      ],
      edges: [],
    } as unknown as Prisma.JsonValue;

    let microsoftTrigger: {
      onActivate: jest.Mock;
      onDeactivate: jest.Mock;
      verifySignature: jest.Mock;
    };

    beforeEach(() => {
      microsoftTrigger = {
        onActivate: jest.fn(async () => ({
          providerSubId: 'graph-sub-NEW',
          signingSecret: 'cs-new',
          expiresAt: new Date('2026-05-11T00:00:00Z'),
        })),
        onDeactivate: jest.fn(async () => undefined),
        verifySignature: jest.fn(),
      };
      registry.register('outlook-message-received', microsoftTrigger as never);

      prisma.connection.findFirst.mockResolvedValue({
        id: connectionId,
        userId,
        type: 'OAUTH2',
        provider: 'microsoft',
        configEncrypted: 'cfg-enc',
        configNonce: 'cfg-nonce',
        refreshTokenEncrypted: null,
        refreshTokenNonce: null,
      });
      connections.decryptConfig.mockReturnValue({
        accessToken: 'at',
        refreshToken: 'rt',
        scope: 'Mail.Read',
        tokenType: 'Bearer',
      });
    });

    it('rotates a Microsoft subscription nearing expiry: deactivate → activate → update', async () => {
      prisma.providerSubscription.findUnique.mockResolvedValueOnce({
        id: 'sub-1',
        workflowId,
        nodeId: 'trigger-node-1',
        provider: 'microsoft',
        providerSubId: 'graph-sub-OLD',
        secretEnc: 'old-cipher',
        secretNonce: 'old-nonce',
        expiresAt: new Date('2026-05-09T00:00:00Z'),
        workflow: {
          id: workflowId,
          organizationId,
          isActive: true,
          definition: microsoftDefinition,
        },
      });

      await service.renewSubscription('sub-1');

      expect(microsoftTrigger.onDeactivate).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId,
          nodeId: 'trigger-node-1',
          providerSubId: 'graph-sub-OLD',
        }),
      );
      expect(microsoftTrigger.onActivate).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId,
          nodeId: 'trigger-node-1',
          callbackUrl: expect.stringContaining('/v1/provider-webhooks/microsoft/sub-1'),
        }),
      );
      expect(crypto.encrypt).toHaveBeenCalledWith('cs-new');
      expect(prisma.providerSubscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: expect.objectContaining({
          providerSubId: 'graph-sub-NEW',
          secretEnc: 'sig-cipher',
          secretNonce: 'sig-nonce',
          expiresAt: new Date('2026-05-11T00:00:00Z'),
        }),
      });
    });

    it('continues with onActivate even when onDeactivate throws (best-effort cleanup)', async () => {
      prisma.providerSubscription.findUnique.mockResolvedValueOnce({
        id: 'sub-1',
        workflowId,
        nodeId: 'trigger-node-1',
        provider: 'microsoft',
        providerSubId: 'graph-sub-OLD',
        secretEnc: 'old-cipher',
        secretNonce: 'old-nonce',
        expiresAt: new Date('2026-05-09T00:00:00Z'),
        workflow: {
          id: workflowId,
          organizationId,
          isActive: true,
          definition: microsoftDefinition,
        },
      });
      microsoftTrigger.onDeactivate.mockRejectedValueOnce(new Error('graph 502'));

      await service.renewSubscription('sub-1');

      expect(microsoftTrigger.onActivate).toHaveBeenCalled();
      expect(prisma.providerSubscription.update).toHaveBeenCalled();
    });
  });
});
