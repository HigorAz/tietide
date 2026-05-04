import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { UsageService } from './usage.service';
import { UsageRange } from './dto/usage-summary-query.dto';

interface PrismaMock {
  workflow: {
    count: jest.Mock;
    findMany: jest.Mock;
  };
  workflowExecution: {
    findMany: jest.Mock;
  };
}

const userId = 'user-uuid-1';
const otherUserId = 'user-uuid-2';

// 2026-05-04T12:00:00Z is a Monday — chosen so a 7d window straddles April→May.
const NOW = new Date('2026-05-04T12:00:00Z');

const exec = (overrides: {
  workflowId?: string;
  status?: string;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  createdAt?: Date;
}): {
  workflowId: string;
  status: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
} => ({
  workflowId: overrides.workflowId ?? 'wf-a',
  status: overrides.status ?? 'SUCCESS',
  startedAt:
    overrides.startedAt === undefined ? new Date('2026-05-04T10:00:00Z') : overrides.startedAt,
  finishedAt:
    overrides.finishedAt === undefined ? new Date('2026-05-04T10:00:01Z') : overrides.finishedAt,
  createdAt: overrides.createdAt ?? new Date('2026-05-04T10:00:00Z'),
});

describe('UsageService', () => {
  let service: UsageService;
  let prisma: PrismaMock;

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    prisma = {
      workflow: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      workflowExecution: {
        findMany: jest.fn(),
      },
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [UsageService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = mod.get(UsageService);
  });

  describe('getSummary — empty state', () => {
    it('returns zeros and a zero-filled runsPerDay when the user has no executions', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([]);
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue([]);

      const result = await service.getSummary(userId, UsageRange.D7);

      expect(result.totalRuns).toBe(0);
      expect(result.successRate).toBe(0);
      expect(result.avgDurationMs).toBe(0);
      expect(result.activeWorkflows).toBe(0);
      expect(result.runsPerDay).toHaveLength(7);
      expect(result.runsPerDay.every((p) => p.count === 0)).toBe(true);
      expect(result.topWorkflows).toEqual([]);
    });
  });

  describe('getSummary — totals and rates', () => {
    it('returns totalRuns equal to the number of executions for the caller', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([
        exec({ status: 'SUCCESS' }),
        exec({ status: 'FAILED' }),
        exec({ status: 'SUCCESS' }),
      ]);
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue([{ id: 'wf-a', name: 'Alpha' }]);

      const result = await service.getSummary(userId, UsageRange.D7);

      expect(result.totalRuns).toBe(3);
    });

    it('computes successRate as the SUCCESS fraction in [0,1]', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([
        exec({ status: 'SUCCESS' }),
        exec({ status: 'SUCCESS' }),
        exec({ status: 'FAILED' }),
        exec({ status: 'SUCCESS' }),
      ]);
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue([{ id: 'wf-a', name: 'Alpha' }]);

      const result = await service.getSummary(userId, UsageRange.D7);

      expect(result.successRate).toBeCloseTo(0.75, 5);
    });

    it('returns successRate=0 when there are no executions', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([]);
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue([]);

      const result = await service.getSummary(userId, UsageRange.D7);

      expect(result.successRate).toBe(0);
    });

    it('returns activeWorkflows from workflow.count filtered by userId and isActive=true', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([]);
      prisma.workflow.count.mockResolvedValue(7);
      prisma.workflow.findMany.mockResolvedValue([]);

      const result = await service.getSummary(userId, UsageRange.D7);

      expect(result.activeWorkflows).toBe(7);
      expect(prisma.workflow.count).toHaveBeenCalledWith({
        where: { userId, isActive: true },
      });
    });
  });

  describe('getSummary — avgDurationMs', () => {
    it('averages finishedAt - startedAt across terminal rows', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([
        exec({
          startedAt: new Date('2026-05-04T10:00:00Z'),
          finishedAt: new Date('2026-05-04T10:00:01Z'), // 1000 ms
        }),
        exec({
          startedAt: new Date('2026-05-04T10:00:00Z'),
          finishedAt: new Date('2026-05-04T10:00:03Z'), // 3000 ms
        }),
      ]);
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue([{ id: 'wf-a', name: 'Alpha' }]);

      const result = await service.getSummary(userId, UsageRange.D7);

      expect(result.avgDurationMs).toBe(2000);
    });

    it('excludes rows missing startedAt or finishedAt', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([
        exec({
          startedAt: new Date('2026-05-04T10:00:00Z'),
          finishedAt: new Date('2026-05-04T10:00:02Z'), // 2000 ms
        }),
        exec({ status: 'RUNNING', startedAt: new Date('2026-05-04T10:00:00Z'), finishedAt: null }),
        exec({ status: 'PENDING', startedAt: null, finishedAt: null }),
      ]);
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue([{ id: 'wf-a', name: 'Alpha' }]);

      const result = await service.getSummary(userId, UsageRange.D7);

      // Only the first row contributes — average is just its 2000ms.
      expect(result.avgDurationMs).toBe(2000);
    });

    it('returns 0 when no rows have both startedAt and finishedAt', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([
        exec({ status: 'PENDING', startedAt: null, finishedAt: null }),
        exec({ status: 'RUNNING', startedAt: new Date('2026-05-04T10:00:00Z'), finishedAt: null }),
      ]);
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue([{ id: 'wf-a', name: 'Alpha' }]);

      const result = await service.getSummary(userId, UsageRange.D7);

      expect(result.avgDurationMs).toBe(0);
    });
  });

  describe('getSummary — runsPerDay', () => {
    it('returns a continuous array of rangeDays length, zero-filled where no runs occurred', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([]);
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue([]);

      const r7 = await service.getSummary(userId, UsageRange.D7);
      const r30 = await service.getSummary(userId, UsageRange.D30);
      const r90 = await service.getSummary(userId, UsageRange.D90);

      expect(r7.runsPerDay).toHaveLength(7);
      expect(r30.runsPerDay).toHaveLength(30);
      expect(r90.runsPerDay).toHaveLength(90);
    });

    it('uses UTC YYYY-MM-DD keys ordered ascending, ending on today', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([]);
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue([]);

      const result = await service.getSummary(userId, UsageRange.D7);

      const dates = result.runsPerDay.map((p) => p.date);
      expect(dates).toEqual([
        '2026-04-28',
        '2026-04-29',
        '2026-04-30',
        '2026-05-01',
        '2026-05-02',
        '2026-05-03',
        '2026-05-04',
      ]);
    });

    it('buckets executions by UTC date of startedAt (falling back to createdAt)', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([
        exec({
          startedAt: new Date('2026-05-04T01:00:00Z'),
          finishedAt: new Date('2026-05-04T01:00:01Z'),
        }),
        exec({
          startedAt: new Date('2026-05-04T23:30:00Z'),
          finishedAt: new Date('2026-05-04T23:30:01Z'),
        }),
        exec({
          startedAt: new Date('2026-05-03T12:00:00Z'),
          finishedAt: new Date('2026-05-03T12:00:01Z'),
        }),
        exec({
          status: 'PENDING',
          startedAt: null,
          finishedAt: null,
          createdAt: new Date('2026-05-02T08:00:00Z'),
        }),
      ]);
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue([{ id: 'wf-a', name: 'Alpha' }]);

      const result = await service.getSummary(userId, UsageRange.D7);

      const lookup = new Map(result.runsPerDay.map((p) => [p.date, p.count]));
      expect(lookup.get('2026-05-04')).toBe(2);
      expect(lookup.get('2026-05-03')).toBe(1);
      expect(lookup.get('2026-05-02')).toBe(1);
      expect(lookup.get('2026-04-28')).toBe(0);
    });
  });

  describe('getSummary — topWorkflows', () => {
    it('returns the top 5 workflows by run count, hydrated with names, with per-workflow successRate', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([
        // wf-a: 4 runs, 3 success
        exec({ workflowId: 'wf-a', status: 'SUCCESS' }),
        exec({ workflowId: 'wf-a', status: 'SUCCESS' }),
        exec({ workflowId: 'wf-a', status: 'SUCCESS' }),
        exec({ workflowId: 'wf-a', status: 'FAILED' }),
        // wf-b: 2 runs, 1 success
        exec({ workflowId: 'wf-b', status: 'SUCCESS' }),
        exec({ workflowId: 'wf-b', status: 'FAILED' }),
        // wf-c: 1 run, 1 success
        exec({ workflowId: 'wf-c', status: 'SUCCESS' }),
      ]);
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue([
        { id: 'wf-a', name: 'Alpha' },
        { id: 'wf-b', name: 'Beta' },
        { id: 'wf-c', name: 'Charlie' },
      ]);

      const result = await service.getSummary(userId, UsageRange.D7);

      expect(result.topWorkflows).toHaveLength(3);
      expect(result.topWorkflows[0]).toEqual({
        id: 'wf-a',
        name: 'Alpha',
        runs: 4,
        successRate: 0.75,
      });
      expect(result.topWorkflows[1]).toEqual({
        id: 'wf-b',
        name: 'Beta',
        runs: 2,
        successRate: 0.5,
      });
      expect(result.topWorkflows[2]).toEqual({
        id: 'wf-c',
        name: 'Charlie',
        runs: 1,
        successRate: 1,
      });
    });

    it('caps topWorkflows at 5 even when more workflows have runs', async () => {
      const rows = Array.from({ length: 7 }, (_, i) =>
        exec({ workflowId: `wf-${i}`, status: 'SUCCESS' }),
      );
      prisma.workflowExecution.findMany.mockResolvedValue(rows);
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue(
        Array.from({ length: 7 }, (_, i) => ({ id: `wf-${i}`, name: `WF ${i}` })),
      );

      const result = await service.getSummary(userId, UsageRange.D7);

      expect(result.topWorkflows).toHaveLength(5);
    });

    it('hydrates only the workflows that appear in the top set', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([
        exec({ workflowId: 'wf-a', status: 'SUCCESS' }),
        exec({ workflowId: 'wf-b', status: 'SUCCESS' }),
      ]);
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue([
        { id: 'wf-a', name: 'Alpha' },
        { id: 'wf-b', name: 'Beta' },
      ]);

      await service.getSummary(userId, UsageRange.D7);

      expect(prisma.workflow.findMany).toHaveBeenCalledWith({
        where: { id: { in: expect.arrayContaining(['wf-a', 'wf-b']) } },
        select: { id: true, name: true },
      });
    });

    it('falls back to a placeholder name when a workflow row is missing (defensive)', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([
        exec({ workflowId: 'wf-a', status: 'SUCCESS' }),
      ]);
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue([]); // workflow deleted between queries

      const result = await service.getSummary(userId, UsageRange.D7);

      expect(result.topWorkflows[0]).toEqual(
        expect.objectContaining({ id: 'wf-a', runs: 1, successRate: 1 }),
      );
      expect(typeof result.topWorkflows[0].name).toBe('string');
    });
  });

  describe('getSummary — range filtering', () => {
    const rangeDays: Record<UsageRange, number> = {
      [UsageRange.D7]: 7,
      [UsageRange.D30]: 30,
      [UsageRange.D90]: 90,
    };

    it.each([UsageRange.D7, UsageRange.D30, UsageRange.D90])(
      'passes createdAt: { gte: now - %s } to Prisma',
      async (range) => {
        prisma.workflowExecution.findMany.mockResolvedValue([]);
        prisma.workflow.count.mockResolvedValue(0);
        prisma.workflow.findMany.mockResolvedValue([]);

        await service.getSummary(userId, range);

        const args = prisma.workflowExecution.findMany.mock.calls[0][0] as {
          where: { createdAt: { gte: Date } };
        };
        const expectedSince = new Date(NOW.getTime() - rangeDays[range] * 24 * 60 * 60 * 1000);
        // Allow ±1 second of drift; in practice it's exact since fake timers are pinned.
        expect(args.where.createdAt.gte.getTime()).toBeGreaterThanOrEqual(
          expectedSince.getTime() - 1000,
        );
        expect(args.where.createdAt.gte.getTime()).toBeLessThanOrEqual(
          expectedSince.getTime() + 1000,
        );
      },
    );
  });

  describe('getSummary — IDOR scoping', () => {
    it('filters WorkflowExecution by workflow.userId === userId', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([]);
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue([]);

      await service.getSummary(userId, UsageRange.D7);

      expect(prisma.workflowExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workflow: { userId } }),
        }),
      );
    });

    it('filters Workflow.count by userId from the JWT (never from outside)', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([]);
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue([]);

      await service.getSummary(otherUserId, UsageRange.D7);

      expect(prisma.workflow.count).toHaveBeenCalledWith({
        where: { userId: otherUserId, isActive: true },
      });
    });

    it('does not return data for executions belonging to another user (Prisma scoping enforces this)', async () => {
      // Simulate Prisma honoring the scope: empty result for this user.
      prisma.workflowExecution.findMany.mockResolvedValue([]);
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue([]);

      const result = await service.getSummary(userId, UsageRange.D7);

      expect(result.totalRuns).toBe(0);
      expect(result.topWorkflows).toEqual([]);
    });
  });
});
