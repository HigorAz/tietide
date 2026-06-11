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
  $transaction: jest.Mock;
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
      // Default: run the callback against the prisma mock itself (the tx client
      // is the same shape in these unit tests). Individual tests override as needed.
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
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

  describe('assertCanCreateWorkflow', () => {
    it('throws 402 with reason "workflows" once a FREE workspace reaches its workflow cap', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ plan: 'FREE' });
      prisma.workflow.count.mockResolvedValue(PLAN_LIMITS.FREE.maxWorkflows);

      const promise = service.assertCanCreateWorkflow(ORG);
      await expect(promise).rejects.toBeInstanceOf(PaymentRequiredException);
      await expect(promise).rejects.toMatchObject({
        getResponse: expect.any(Function),
      });
      try {
        await service.assertCanCreateWorkflow(ORG);
      } catch (err) {
        expect((err as PaymentRequiredException).getResponse()).toMatchObject({
          reason: 'workflows',
        });
      }
    });

    it('allows creation below the workflow cap', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ plan: 'FREE' });
      prisma.workflow.count.mockResolvedValue(0);
      await expect(service.assertCanCreateWorkflow(ORG)).resolves.toBeUndefined();
    });

    it('never blocks on a plan with unlimited workflows and does not count', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ plan: 'BUSINESS' });
      await expect(service.assertCanCreateWorkflow(ORG)).resolves.toBeUndefined();
      expect(prisma.workflow.count).not.toHaveBeenCalled();
    });

    it('treats a missing subscription row as FREE', async () => {
      prisma.subscription.findUnique.mockResolvedValue(null);
      prisma.workflow.count.mockResolvedValue(PLAN_LIMITS.FREE.maxWorkflows);
      await expect(service.assertCanCreateWorkflow(ORG)).rejects.toBeInstanceOf(
        PaymentRequiredException,
      );
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

  // W5.25: count-then-create is not atomic, so concurrent requests at the boundary
  // can all read used<cap and all proceed (overshoot). These helpers run the create
  // and a post-create cap re-check inside a single serializable transaction so a
  // racing second writer is rolled back.
  describe('enforceRunCapAround', () => {
    it('runs the create inside a single serializable transaction', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ plan: 'FREE', currentPeriodStart: null });
      prisma.workflowExecution.count.mockResolvedValue(1); // 1 run total after create — under cap
      const create = jest.fn().mockResolvedValue({ id: 'exec-1' });

      const result = await service.enforceRunCapAround(ORG, create);

      expect(result).toEqual({ id: 'exec-1' });
      expect(create).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const opts = prisma.$transaction.mock.calls[0][1] as { isolationLevel?: string } | undefined;
      expect(opts?.isolationLevel).toBe('Serializable');
    });

    it('rolls back (throws 402 runs) when the post-create count overshoots the cap', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ plan: 'FREE', currentPeriodStart: null });
      // After our own create the period count exceeds the FREE hard cap — a
      // concurrent writer also inserted, pushing us over. We must roll back.
      prisma.workflowExecution.count.mockResolvedValue((PLAN_LIMITS.FREE.hardRunCap as number) + 1);
      const create = jest.fn().mockResolvedValue({ id: 'exec-loser' });

      await expect(service.enforceRunCapAround(ORG, create)).rejects.toBeInstanceOf(
        PaymentRequiredException,
      );
      // The create did run (inside the tx) but the throw rolls the tx back.
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('allows the create that exactly fills the cap (boundary)', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ plan: 'FREE', currentPeriodStart: null });
      prisma.workflowExecution.count.mockResolvedValue(PLAN_LIMITS.FREE.hardRunCap as number);
      const create = jest.fn().mockResolvedValue({ id: 'exec-fills' });

      await expect(service.enforceRunCapAround(ORG, create)).resolves.toEqual({ id: 'exec-fills' });
    });

    it('skips the post-create re-count for an unlimited (paid) plan', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ plan: 'PRO', currentPeriodStart: null });
      const create = jest.fn().mockResolvedValue({ id: 'exec-paid' });

      await expect(service.enforceRunCapAround(ORG, create)).resolves.toEqual({ id: 'exec-paid' });
      expect(prisma.workflowExecution.count).not.toHaveBeenCalled();
    });
  });

  describe('enforceSeatCapAround', () => {
    it('rolls back (throws 402 seats) when the post-create member count overshoots the cap', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ plan: 'FREE' });
      const maxSeats = PLAN_LIMITS.FREE.maxSeats as number;
      // After our membership insert the member count exceeds maxSeats.
      prisma.organizationMember.count.mockResolvedValue(maxSeats + 1);
      const create = jest.fn().mockResolvedValue({ id: 'member-loser' });

      await expect(service.enforceSeatCapAround(ORG, create)).rejects.toBeInstanceOf(
        PaymentRequiredException,
      );
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('allows the membership that exactly fills the seat cap', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ plan: 'FREE' });
      prisma.organizationMember.count.mockResolvedValue(PLAN_LIMITS.FREE.maxSeats as number);
      const create = jest.fn().mockResolvedValue({ id: 'member-fills' });

      await expect(service.enforceSeatCapAround(ORG, create)).resolves.toEqual({
        id: 'member-fills',
      });
    });

    it('skips the post-create re-count for an unlimited-seat plan', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ plan: 'BUSINESS' });
      const create = jest.fn().mockResolvedValue({ id: 'member-paid' });

      await expect(service.enforceSeatCapAround(ORG, create)).resolves.toEqual({
        id: 'member-paid',
      });
      expect(prisma.organizationMember.count).not.toHaveBeenCalled();
    });
  });
});
