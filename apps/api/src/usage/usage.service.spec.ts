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
  connection: {
    groupBy: jest.Mock;
  };
  executionStep: {
    groupBy: jest.Mock;
  };
}

const userId = 'user-uuid-1';
const otherUserId = 'user-uuid-2';

// 2026-05-04T12:00:00Z is a Monday — chosen so a 7d window straddles April→May.
const NOW = new Date('2026-05-04T12:00:00Z');

const exec = (overrides: {
  workflowId?: string;
  status?: string;
  triggerType?: string;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  createdAt?: Date;
}): {
  workflowId: string;
  status: string;
  triggerType: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
} => ({
  workflowId: overrides.workflowId ?? 'wf-a',
  status: overrides.status ?? 'SUCCESS',
  triggerType: overrides.triggerType ?? 'manual',
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
      connection: {
        groupBy: jest.fn(),
      },
      executionStep: {
        groupBy: jest.fn(),
      },
    };
    // Defaults so existing tests that only configure executions/workflow stay green.
    prisma.connection.groupBy.mockResolvedValue([]);
    prisma.executionStep.groupBy.mockResolvedValue([]);

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
        where: { organizationId: userId, isActive: true },
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
          where: expect.objectContaining({ workflow: { organizationId: userId } }),
        }),
      );
    });

    it('filters Workflow.count by userId from the JWT (never from outside)', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([]);
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue([]);

      await service.getSummary(otherUserId, UsageRange.D7);

      expect(prisma.workflow.count).toHaveBeenCalledWith({
        where: { organizationId: otherUserId, isActive: true },
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

  describe('getSummary — dry-run exclusion', () => {
    it('passes isDryRun: false to Prisma so test-mode executions are excluded from analytics', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([]);
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue([]);

      await service.getSummary(userId, UsageRange.D7);

      expect(prisma.workflowExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isDryRun: false }),
        }),
      );
    });
  });

  describe('getSummary — status breakdown, triggers, error-rate, busiest hours', () => {
    it('counts each ExecutionStatus, with all six statuses present (stable donut)', async () => {
      prisma.workflowExecution.findMany
        .mockResolvedValueOnce([
          exec({ status: 'SUCCESS' }),
          exec({ status: 'SUCCESS' }),
          exec({ status: 'FAILED' }),
          exec({ status: 'RUNNING' }),
        ])
        .mockResolvedValueOnce([]) // prior window
        .mockResolvedValueOnce([]); // recent failures
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue([{ id: 'wf-a', name: 'Alpha' }]);

      const result = await service.getSummary(userId, UsageRange.D7);

      const byStatus = new Map(result.statusBreakdown.map((s) => [s.status, s.count]));
      expect(result.statusBreakdown).toHaveLength(6);
      expect(byStatus.get('SUCCESS')).toBe(2);
      expect(byStatus.get('FAILED')).toBe(1);
      expect(byStatus.get('RUNNING')).toBe(1);
      expect(byStatus.get('PENDING')).toBe(0);
    });

    it('groups runs by triggerType ordered by count desc', async () => {
      prisma.workflowExecution.findMany
        .mockResolvedValueOnce([
          exec({ triggerType: 'cron' }),
          exec({ triggerType: 'cron' }),
          exec({ triggerType: 'webhook' }),
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue([{ id: 'wf-a', name: 'Alpha' }]);

      const result = await service.getSummary(userId, UsageRange.D7);

      expect(result.triggerDistribution[0]).toEqual({ triggerType: 'cron', count: 2 });
      expect(result.triggerDistribution[1]).toEqual({ triggerType: 'webhook', count: 1 });
    });

    it('carries per-day FAILED counts on runsPerDay (error-rate trend)', async () => {
      prisma.workflowExecution.findMany
        .mockResolvedValueOnce([
          exec({ status: 'FAILED', startedAt: new Date('2026-05-04T03:00:00Z'), finishedAt: null }),
          exec({
            status: 'SUCCESS',
            startedAt: new Date('2026-05-04T04:00:00Z'),
            finishedAt: null,
          }),
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue([{ id: 'wf-a', name: 'Alpha' }]);

      const result = await service.getSummary(userId, UsageRange.D7);

      const today = result.runsPerDay.find((p) => p.date === '2026-05-04');
      expect(today).toEqual({ date: '2026-05-04', count: 2, failed: 1 });
    });

    it('returns 24 busiest-hour buckets', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([]);
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue([]);

      const result = await service.getSummary(userId, UsageRange.D7);

      expect(result.busiestHours).toHaveLength(24);
    });
  });

  describe('getSummary — recent failures', () => {
    it('returns the latest FAILED executions (newest first, capped) with workflow name', async () => {
      prisma.workflowExecution.findMany
        .mockResolvedValueOnce([]) // current window
        .mockResolvedValueOnce([]) // prior window
        .mockResolvedValueOnce([
          {
            id: 'ex-1',
            workflowId: 'wf-a',
            error: 'boom',
            finishedAt: new Date('2026-05-04T10:00:05Z'),
            createdAt: new Date('2026-05-04T10:00:00Z'),
            workflow: { name: 'Alpha' },
          },
        ]);
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue([]);

      const result = await service.getSummary(userId, UsageRange.D7);

      expect(result.recentFailures).toEqual([
        {
          id: 'ex-1',
          workflowId: 'wf-a',
          workflowName: 'Alpha',
          error: 'boom',
          finishedAt: '2026-05-04T10:00:05.000Z',
          createdAt: '2026-05-04T10:00:00.000Z',
        },
      ]);

      const failCall = prisma.workflowExecution.findMany.mock.calls[2][0] as {
        where: Record<string, unknown>;
        orderBy: unknown;
        take: number;
      };
      expect(failCall.where).toEqual(
        expect.objectContaining({
          workflow: { organizationId: userId },
          isDryRun: false,
          status: 'FAILED',
        }),
      );
      expect(failCall.orderBy).toEqual({ createdAt: 'desc' });
      expect(typeof failCall.take).toBe('number');
    });
  });

  describe('getSummary — connection health', () => {
    it('groups connections by status for the org only, zero-filling all statuses', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([]);
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue([]);
      prisma.connection.groupBy.mockResolvedValue([
        { status: 'ACTIVE', _count: { _all: 3 } },
        { status: 'ERROR', _count: { _all: 1 } },
      ]);

      const result = await service.getSummary(userId, UsageRange.D7);

      const byStatus = new Map(result.connectionHealth.map((c) => [c.status, c.count]));
      expect(byStatus.get('ACTIVE')).toBe(3);
      expect(byStatus.get('ERROR')).toBe(1);
      expect(byStatus.get('EXPIRED')).toBe(0);
      expect(byStatus.get('REVOKED')).toBe(0);

      expect(prisma.connection.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['status'],
          where: { organizationId: userId },
          _count: { _all: true },
        }),
      );
    });
  });

  describe('getSummary — per-node failure stats', () => {
    it('aggregates FAILED steps by nodeType, org-scoped, sorted desc, with rounded avg duration', async () => {
      prisma.workflowExecution.findMany.mockResolvedValue([]);
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue([]);
      prisma.executionStep.groupBy.mockResolvedValue([
        { nodeType: 'http-request', _count: { _all: 2 }, _avg: { durationMs: 1500 } },
        { nodeType: 'slack-post-message', _count: { _all: 5 }, _avg: { durationMs: 800.4 } },
      ]);

      const result = await service.getSummary(userId, UsageRange.D7);

      expect(result.nodeFailures[0]).toEqual({
        nodeType: 'slack-post-message',
        failures: 5,
        avgDurationMs: 800,
      });
      expect(result.nodeFailures[1]).toEqual({
        nodeType: 'http-request',
        failures: 2,
        avgDurationMs: 1500,
      });

      expect(prisma.executionStep.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['nodeType'],
          where: expect.objectContaining({
            status: 'FAILED',
            execution: expect.objectContaining({
              isDryRun: false,
              workflow: { organizationId: userId },
            }),
          }),
          _count: { _all: true },
          _avg: { durationMs: true },
        }),
      );
    });
  });

  describe('getSummary — previous-period comparison', () => {
    it('queries the prior equivalent window and computes deltas', async () => {
      prisma.workflowExecution.findMany
        .mockResolvedValueOnce([exec({ status: 'SUCCESS' }), exec({ status: 'SUCCESS' })]) // current: 2
        .mockResolvedValueOnce([exec({ status: 'SUCCESS' })]) // prior: 1
        .mockResolvedValueOnce([]); // recent failures
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue([{ id: 'wf-a', name: 'Alpha' }]);

      const result = await service.getSummary(userId, UsageRange.D7);

      expect(result.comparison.totalRunsDelta).toBeCloseTo(1, 5); // (2-1)/1
      expect(result.comparison.successRateDelta).toBeCloseTo(0, 5);

      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const prevCall = prisma.workflowExecution.findMany.mock.calls[1][0] as {
        where: { createdAt: { gte: Date; lt: Date } };
      };
      expect(prevCall.where.createdAt.gte.getTime()).toBe(NOW.getTime() - 2 * sevenDaysMs);
      expect(prevCall.where.createdAt.lt.getTime()).toBe(NOW.getTime() - sevenDaysMs);
    });

    it('returns null deltas when the prior window is empty (no divide-by-zero)', async () => {
      prisma.workflowExecution.findMany
        .mockResolvedValueOnce([exec({ status: 'SUCCESS' })]) // current
        .mockResolvedValueOnce([]) // prior empty
        .mockResolvedValueOnce([]); // recent failures
      prisma.workflow.count.mockResolvedValue(0);
      prisma.workflow.findMany.mockResolvedValue([{ id: 'wf-a', name: 'Alpha' }]);

      const result = await service.getSummary(userId, UsageRange.D7);

      expect(result.comparison.totalRunsDelta).toBeNull();
      expect(result.comparison.avgDurationDelta).toBeNull();
    });
  });
});
