import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsageRange } from './dto/usage-summary-query.dto';
import type {
  RunsPerDayPointDto,
  TopWorkflowDto,
  UsageSummaryResponseDto,
} from './dto/usage-summary-response.dto';

const RANGE_DAYS: Record<UsageRange, number> = {
  [UsageRange.D7]: 7,
  [UsageRange.D30]: 30,
  [UsageRange.D90]: 90,
};

const TOP_WORKFLOWS_LIMIT = 5;

interface ExecutionRow {
  workflowId: string;
  status: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(organizationId: string, range: UsageRange): Promise<UsageSummaryResponseDto> {
    const rangeDays = RANGE_DAYS[range];
    const now = new Date();
    const since = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000);

    const baseWhere: Prisma.WorkflowExecutionWhereInput = {
      workflow: { organizationId },
      createdAt: { gte: since },
      isDryRun: false,
    };

    const [executions, activeWorkflows] = await Promise.all([
      this.prisma.workflowExecution.findMany({
        where: baseWhere,
        select: {
          workflowId: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          createdAt: true,
        },
      }) as Promise<ExecutionRow[]>,
      this.prisma.workflow.count({ where: { organizationId, isActive: true } }),
    ]);

    const totalRuns = executions.length;
    const successCount = executions.filter((e) => e.status === 'SUCCESS').length;
    const successRate = totalRuns === 0 ? 0 : successCount / totalRuns;
    const avgDurationMs = computeAvgDurationMs(executions);
    const runsPerDay = bucketRunsPerDay(executions, now, rangeDays);
    const topWorkflows = await this.computeTopWorkflows(executions);

    return {
      totalRuns,
      successRate,
      avgDurationMs,
      activeWorkflows,
      runsPerDay,
      topWorkflows,
    };
  }

  private async computeTopWorkflows(executions: ExecutionRow[]): Promise<TopWorkflowDto[]> {
    if (executions.length === 0) return [];

    const countsById = new Map<string, { runs: number; successes: number }>();
    for (const e of executions) {
      const entry = countsById.get(e.workflowId) ?? { runs: 0, successes: 0 };
      entry.runs += 1;
      if (e.status === 'SUCCESS') entry.successes += 1;
      countsById.set(e.workflowId, entry);
    }

    const top = Array.from(countsById.entries())
      .sort(([, a], [, b]) => b.runs - a.runs)
      .slice(0, TOP_WORKFLOWS_LIMIT);

    if (top.length === 0) return [];

    const ids = top.map(([id]) => id);
    const workflows = await this.prisma.workflow.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const nameById = new Map(workflows.map((w) => [w.id, w.name]));

    return top.map(([id, { runs, successes }]) => ({
      id,
      name: nameById.get(id) ?? '(unknown workflow)',
      runs,
      successRate: runs === 0 ? 0 : successes / runs,
    }));
  }
}

function computeAvgDurationMs(executions: ExecutionRow[]): number {
  let totalMs = 0;
  let n = 0;
  for (const e of executions) {
    if (e.startedAt && e.finishedAt) {
      totalMs += e.finishedAt.getTime() - e.startedAt.getTime();
      n += 1;
    }
  }
  return n === 0 ? 0 : Math.round(totalMs / n);
}

function bucketRunsPerDay(
  executions: ExecutionRow[],
  now: Date,
  rangeDays: number,
): RunsPerDayPointDto[] {
  const counts = new Map<string, number>();
  for (const e of executions) {
    const t = e.startedAt ?? e.createdAt;
    const key = utcDateKey(t);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const points: RunsPerDayPointDto[] = [];
  const todayMidnightUtc = utcMidnight(now);
  for (let i = rangeDays - 1; i >= 0; i--) {
    const day = new Date(todayMidnightUtc.getTime() - i * 24 * 60 * 60 * 1000);
    const key = utcDateKey(day);
    points.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return points;
}

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
