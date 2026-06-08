import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsageRange } from './dto/usage-summary-query.dto';
import type {
  ConnectionHealthDto,
  NodeFailureDto,
  RecentFailureDto,
  TopWorkflowDto,
  UsageSummaryResponseDto,
} from './dto/usage-summary-response.dto';
import {
  bucketRunsPerDay,
  computeAvgDurationMs,
  computeBusiestHours,
  computeComparison,
  computeStatusBreakdown,
  computeTriggerDistribution,
  type ExecutionRow,
  type PeriodTotals,
} from './usage.aggregations';

const RANGE_DAYS: Record<UsageRange, number> = {
  [UsageRange.D7]: 7,
  [UsageRange.D30]: 30,
  [UsageRange.D90]: 90,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_WORKFLOWS_LIMIT = 5;
const RECENT_FAILURES_LIMIT = 10;
const NODE_FAILURES_LIMIT = 8;

// Zero-filled in this order for a stable connection-health donut.
const ALL_CONNECTION_STATUSES = ['ACTIVE', 'EXPIRED', 'ERROR', 'REVOKED'] as const;

const EXECUTION_SELECT = {
  workflowId: true,
  status: true,
  triggerType: true,
  startedAt: true,
  finishedAt: true,
  createdAt: true,
} as const;

interface RecentFailureRow {
  id: string;
  workflowId: string;
  error: string | null;
  finishedAt: Date | null;
  createdAt: Date;
  workflow: { name: string } | null;
}

interface ConnectionGroup {
  status: string;
  _count: { _all: number };
}

interface NodeGroup {
  nodeType: string;
  _count: { _all: number };
  _avg: { durationMs: number | null };
}

@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(organizationId: string, range: UsageRange): Promise<UsageSummaryResponseDto> {
    const rangeDays = RANGE_DAYS[range];
    const now = new Date();
    const windowMs = rangeDays * DAY_MS;
    const since = new Date(now.getTime() - windowMs);
    const prevSince = new Date(now.getTime() - 2 * windowMs);

    const baseWhere: Prisma.WorkflowExecutionWhereInput = {
      workflow: { organizationId },
      createdAt: { gte: since },
      isDryRun: false,
    };

    const [
      executions,
      prevExecutions,
      recentFailureRows,
      activeWorkflows,
      connectionGroups,
      nodeGroups,
    ] = await Promise.all([
      this.prisma.workflowExecution.findMany({
        where: baseWhere,
        select: EXECUTION_SELECT,
      }) as Promise<ExecutionRow[]>,
      this.prisma.workflowExecution.findMany({
        where: {
          workflow: { organizationId },
          isDryRun: false,
          createdAt: { gte: prevSince, lt: since },
        },
        select: EXECUTION_SELECT,
      }) as Promise<ExecutionRow[]>,
      this.prisma.workflowExecution.findMany({
        where: { ...baseWhere, status: 'FAILED' },
        select: {
          id: true,
          workflowId: true,
          error: true,
          finishedAt: true,
          createdAt: true,
          workflow: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: RECENT_FAILURES_LIMIT,
      }) as Promise<RecentFailureRow[]>,
      this.prisma.workflow.count({ where: { organizationId, isActive: true } }),
      this.prisma.connection.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: { _all: true },
      }) as unknown as Promise<ConnectionGroup[]>,
      this.prisma.executionStep.groupBy({
        by: ['nodeType'],
        where: {
          status: 'FAILED',
          execution: { isDryRun: false, createdAt: { gte: since }, workflow: { organizationId } },
        },
        _count: { _all: true },
        _avg: { durationMs: true },
      }) as unknown as Promise<NodeGroup[]>,
    ]);

    const totalRuns = executions.length;
    const successRate = computeSuccessRate(executions);
    const avgDurationMs = computeAvgDurationMs(executions);

    const currentTotals: PeriodTotals = { totalRuns, successRate, avgDurationMs };
    const prevTotals: PeriodTotals = {
      totalRuns: prevExecutions.length,
      successRate: computeSuccessRate(prevExecutions),
      avgDurationMs: computeAvgDurationMs(prevExecutions),
    };

    return {
      totalRuns,
      successRate,
      avgDurationMs,
      activeWorkflows,
      runsPerDay: bucketRunsPerDay(executions, now, rangeDays),
      topWorkflows: await this.computeTopWorkflows(executions),
      statusBreakdown: computeStatusBreakdown(executions),
      triggerDistribution: computeTriggerDistribution(executions),
      busiestHours: computeBusiestHours(executions),
      recentFailures: recentFailureRows.map(toRecentFailureDto),
      connectionHealth: toConnectionHealth(connectionGroups),
      nodeFailures: toNodeFailures(nodeGroups),
      comparison: computeComparison(currentTotals, prevTotals),
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

function computeSuccessRate(rows: ExecutionRow[]): number {
  if (rows.length === 0) return 0;
  const successes = rows.filter((e) => e.status === 'SUCCESS').length;
  return successes / rows.length;
}

function toRecentFailureDto(r: RecentFailureRow): RecentFailureDto {
  return {
    id: r.id,
    workflowId: r.workflowId,
    workflowName: r.workflow?.name ?? '(unknown workflow)',
    error: r.error ?? null,
    finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}

function toConnectionHealth(groups: ConnectionGroup[]): ConnectionHealthDto[] {
  const byStatus = new Map(groups.map((g) => [g.status, g._count._all]));
  return ALL_CONNECTION_STATUSES.map((status) => ({ status, count: byStatus.get(status) ?? 0 }));
}

function toNodeFailures(groups: NodeGroup[]): NodeFailureDto[] {
  return groups
    .map((g) => ({
      nodeType: g.nodeType,
      failures: g._count._all,
      avgDurationMs: Math.round(g._avg.durationMs ?? 0),
    }))
    .sort((a, b) => b.failures - a.failures)
    .slice(0, NODE_FAILURES_LIMIT);
}
