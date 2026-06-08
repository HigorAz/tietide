import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { PLAN_LIMITS } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from './entitlements.service';
import { PaymentRequiredException } from './payment-required.exception';

interface PrismaMock {
  subscription: { findUnique: jest.Mock };
  organization: { count: jest.Mock };
  organizationMember: { count: jest.Mock };
  organizationInvite: { count: jest.Mock };
  workflow: { count: jest.Mock };
  workflowExecution: { count: jest.Mock };
}

const ORG = 'org-1';
const USER = 'user-1';

describe('EntitlementsService', () => {
  let service: EntitlementsService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    prisma = {
      subscription: { findUnique: jest.fn() },
      organization: { count: jest.fn() },
      organizationMember: { count: jest.fn() },
      organizationInvite: { count: jest.fn() },
      workflow: { count: jest.fn() },
      workflowExecution: { count: jest.fn() },
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [EntitlementsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(EntitlementsService);
  });

  describe('getEntitlements', () => {
    it('reports FREE limits and live usage (seats include pending invites)', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        plan: 'FREE',
        status: 'ACTIVE',
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      });
      prisma.organizationMember.count.mockResolvedValue(1);
      prisma.organizationInvite.count.mockResolvedValue(1);
      prisma.workflowExecution.count.mockResolvedValue(42);
      prisma.workflow.count.mockResolvedValue(3);

      const e = await service.getEntitlements(ORG);

      expect(e.plan).toBe('FREE');
      expect(e.seats).toEqual({
        used: 2,
        included: PLAN_LIMITS.FREE.includedSeats,
        max: PLAN_LIMITS.FREE.maxSeats,
      });
      expect(e.runs.used).toBe(42);
      expect(e.runs.hardCap).toBe(PLAN_LIMITS.FREE.hardRunCap);
      expect(e.workflows.used).toBe(3);
    });

    it('treats a missing subscription row as FREE', async () => {
      prisma.subscription.findUnique.mockResolvedValue(null);
      prisma.organizationMember.count.mockResolvedValue(0);
      prisma.organizationInvite.count.mockResolvedValue(0);
      prisma.workflowExecution.count.mockResolvedValue(0);
      prisma.workflow.count.mockResolvedValue(0);

      const e = await service.getEntitlements(ORG);
      expect(e.plan).toBe('FREE');
      expect(e.runs.hardCap).toBe(PLAN_LIMITS.FREE.hardRunCap);
    });
  });

  describe('assertCanCreateWorkspace', () => {
    it('throws 402 when the user already owns the free-workspace limit', async () => {
      prisma.organization.count.mockResolvedValue(PLAN_LIMITS.FREE.freeWorkspacesPerOwner);
      await expect(service.assertCanCreateWorkspace(USER)).rejects.toBeInstanceOf(
        PaymentRequiredException,
      );
    });

    it('allows creation below the limit', async () => {
      prisma.organization.count.mockResolvedValue(0);
      await expect(service.assertCanCreateWorkspace(USER)).resolves.toBeUndefined();
    });
  });

  describe('assertCanAddSeat', () => {
    it('throws 402 when members + pending invites reach the seat cap (invite path)', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ plan: 'FREE' });
      prisma.organizationMember.count.mockResolvedValue(1);
      prisma.organizationInvite.count.mockResolvedValue(1); // 1 + 1 == maxSeats (2)
      await expect(service.assertCanAddSeat(ORG, true)).rejects.toBeInstanceOf(
        PaymentRequiredException,
      );
    });

    it('ignores pending invites at accept time (only members bound the cap)', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ plan: 'FREE' });
      prisma.organizationMember.count.mockResolvedValue(1);
      prisma.organizationInvite.count.mockResolvedValue(1);
      await expect(service.assertCanAddSeat(ORG, false)).resolves.toBeUndefined();
    });

    it('never blocks on a plan with unlimited seats', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ plan: 'BUSINESS' });
      await expect(service.assertCanAddSeat(ORG, true)).resolves.toBeUndefined();
      expect(prisma.organizationMember.count).not.toHaveBeenCalled();
    });
  });

  describe('assertCanRun', () => {
    it('throws 402 once a FREE workspace reaches its hard run cap', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ plan: 'FREE', currentPeriodStart: null });
      prisma.workflowExecution.count.mockResolvedValue(PLAN_LIMITS.FREE.hardRunCap);
      await expect(service.assertCanRun(ORG)).rejects.toBeInstanceOf(PaymentRequiredException);
    });

    it('allows a FREE workspace below the cap', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ plan: 'FREE', currentPeriodStart: null });
      prisma.workflowExecution.count.mockResolvedValue(0);
      await expect(service.assertCanRun(ORG)).resolves.toBeUndefined();
    });

    it('never blocks a paid (metered) plan and does not count runs', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ plan: 'PRO', currentPeriodStart: null });
      await expect(service.assertCanRun(ORG)).resolves.toBeUndefined();
      expect(prisma.workflowExecution.count).not.toHaveBeenCalled();
    });
  });
});
