import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { ProviderSubscriptionsService } from './provider-subscriptions.service';

interface PrismaMock {
  workflow: { findFirst: jest.Mock };
  providerSubscription: { findMany: jest.Mock };
}

const makePrisma = (): PrismaMock => ({
  workflow: { findFirst: jest.fn() },
  providerSubscription: { findMany: jest.fn() },
});

const asPrisma = (m: PrismaMock): PrismaService => m as unknown as PrismaService;

describe('ProviderSubscriptionsService', () => {
  describe('listForWorkflow', () => {
    it('should throw NotFound when the workflow is not owned by the user', async () => {
      const prisma = makePrisma();
      prisma.workflow.findFirst.mockResolvedValue(null);
      const svc = new ProviderSubscriptionsService(asPrisma(prisma), 'https://tietide.com');

      await expect(svc.listForWorkflow('u1', 'wf1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.providerSubscription.findMany).not.toHaveBeenCalled();
    });

    it('should map subscriptions to callback URLs and trim a trailing slash on the base', async () => {
      const prisma = makePrisma();
      prisma.workflow.findFirst.mockResolvedValue({ id: 'wf1' });
      prisma.providerSubscription.findMany.mockResolvedValue([
        { id: 'sub-1', nodeId: 'node-1', provider: 'discord-bot', expiresAt: null },
      ]);
      const svc = new ProviderSubscriptionsService(asPrisma(prisma), 'https://tietide.com/');

      const out = await svc.listForWorkflow('u1', 'wf1');

      expect(out).toEqual([
        {
          id: 'sub-1',
          nodeId: 'node-1',
          provider: 'discord-bot',
          callbackUrl: 'https://tietide.com/v1/provider-webhooks/discord-bot/sub-1',
          expiresAt: null,
        },
      ]);
      expect(prisma.workflow.findFirst).toHaveBeenCalledWith({
        where: { id: 'wf1', userId: 'u1' },
        select: { id: true },
      });
    });

    it('should serialize expiresAt to ISO', async () => {
      const prisma = makePrisma();
      prisma.workflow.findFirst.mockResolvedValue({ id: 'wf1' });
      prisma.providerSubscription.findMany.mockResolvedValue([
        {
          id: 'sub-2',
          nodeId: 'node-2',
          provider: 'microsoft',
          expiresAt: new Date('2026-06-01T12:00:00.000Z'),
        },
      ]);
      const svc = new ProviderSubscriptionsService(asPrisma(prisma), 'https://tietide.com');

      const out = await svc.listForWorkflow('u1', 'wf1');

      expect(out[0].expiresAt).toBe('2026-06-01T12:00:00.000Z');
    });

    it('should return an empty array when the workflow has no subscriptions', async () => {
      const prisma = makePrisma();
      prisma.workflow.findFirst.mockResolvedValue({ id: 'wf1' });
      prisma.providerSubscription.findMany.mockResolvedValue([]);
      const svc = new ProviderSubscriptionsService(asPrisma(prisma), 'https://tietide.com');

      await expect(svc.listForWorkflow('u1', 'wf1')).resolves.toEqual([]);
    });
  });
});
