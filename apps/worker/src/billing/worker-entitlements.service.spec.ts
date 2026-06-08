import { PLAN_LIMITS } from '@tietide/shared';
import { WorkerEntitlementsService } from './worker-entitlements.service';

interface PrismaMock {
  subscription: { findUnique: jest.Mock };
  workflowExecution: { count: jest.Mock };
}

describe('WorkerEntitlementsService', () => {
  let prisma: PrismaMock;
  let service: WorkerEntitlementsService;

  beforeEach(() => {
    prisma = {
      subscription: { findUnique: jest.fn() },
      workflowExecution: { count: jest.fn() },
    };
    service = new WorkerEntitlementsService(prisma as never);
  });

  it('returns false when a FREE workspace is at its hard run cap', async () => {
    prisma.subscription.findUnique.mockResolvedValue({ plan: 'FREE', currentPeriodStart: null });
    prisma.workflowExecution.count.mockResolvedValue(PLAN_LIMITS.FREE.hardRunCap);

    await expect(service.canRun('org-1')).resolves.toBe(false);
  });

  it('returns true for a FREE workspace below the cap', async () => {
    prisma.subscription.findUnique.mockResolvedValue({ plan: 'FREE', currentPeriodStart: null });
    prisma.workflowExecution.count.mockResolvedValue(0);

    await expect(service.canRun('org-1')).resolves.toBe(true);
  });

  it('returns true for a paid (metered) plan without counting runs', async () => {
    prisma.subscription.findUnique.mockResolvedValue({ plan: 'PRO', currentPeriodStart: null });

    await expect(service.canRun('org-1')).resolves.toBe(true);
    expect(prisma.workflowExecution.count).not.toHaveBeenCalled();
  });

  it('treats a missing subscription as FREE', async () => {
    prisma.subscription.findUnique.mockResolvedValue(null);
    prisma.workflowExecution.count.mockResolvedValue(PLAN_LIMITS.FREE.hardRunCap);

    await expect(service.canRun('org-1')).resolves.toBe(false);
  });
});
