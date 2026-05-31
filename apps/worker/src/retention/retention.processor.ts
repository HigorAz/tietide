import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import type { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { resolveRetentionDays } from './retention.config';
import {
  RETENTION_BATCH_SIZE,
  RETENTION_MAX_BATCHES,
  RETENTION_QUEUE,
  RETENTION_SWEEP_JOB,
  RETENTION_TERMINAL_STATUSES,
} from './retention.constants';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Deletes terminal workflow executions older than the retention window so the
 * executions/steps tables don't grow without bound (W3.5). ExecutionStep rows
 * cascade-delete with their execution (FK onDelete: Cascade). Work is batched so
 * a single sweep never holds one enormous delete lock.
 */
@Processor(RETENTION_QUEUE)
export class RetentionProcessor extends WorkerHost {
  private readonly log = new Logger(RetentionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job): Promise<{ deleted: number }> {
    if (job.name !== RETENTION_SWEEP_JOB) {
      return { deleted: 0 };
    }

    const days = resolveRetentionDays(this.config.get<string>('EXECUTION_RETENTION_DAYS'));
    const cutoff = new Date(Date.now() - days * MS_PER_DAY);
    const where: Prisma.WorkflowExecutionWhereInput = {
      status: { in: [...RETENTION_TERMINAL_STATUSES] },
      createdAt: { lt: cutoff },
    };

    let deleted = 0;
    for (let batch = 0; batch < RETENTION_MAX_BATCHES; batch += 1) {
      const rows = await this.prisma.workflowExecution.findMany({
        where,
        select: { id: true },
        take: RETENTION_BATCH_SIZE,
      });
      if (rows.length === 0) {
        break;
      }
      const { count } = await this.prisma.workflowExecution.deleteMany({
        where: { id: { in: rows.map((r) => r.id) } },
      });
      deleted += count;
      if (rows.length < RETENTION_BATCH_SIZE) {
        break;
      }
      if (batch === RETENTION_MAX_BATCHES - 1) {
        this.log.warn(
          { deleted, days },
          'Execution retention sweep hit the per-run batch cap; remaining rows reaped next run',
        );
      }
    }

    if (deleted > 0) {
      this.log.log({ deleted, days, cutoff: cutoff.toISOString() }, 'Execution retention sweep');
    }
    return { deleted };
  }
}
