import { BadRequestException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { WorkflowDefinition, WorkflowNode } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CRON_JOB_NAME, CRON_QUEUE_NAME, CRON_SCHEDULER_PREFIX } from './cron.constants';
import { isValidCron } from './cron-validator';

export interface AddRepeatableJobArgs {
  workflowId: string;
  expression: string;
  userId: string;
}

export interface CronFirePayload {
  workflowId: string;
  userId: string;
  expression: string;
}

interface JobSchedulerSummary {
  key: string;
}

const CRON_TRIGGER_TYPE = 'cron-trigger';

@Injectable()
export class CronTriggerService implements OnModuleInit {
  private readonly log = new Logger(CronTriggerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(CRON_QUEUE_NAME) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reconcile();
  }

  async addRepeatableJob(args: AddRepeatableJobArgs): Promise<void> {
    if (!isValidCron(args.expression)) {
      throw new BadRequestException(`Invalid cron expression: "${args.expression}"`);
    }

    const schedulerId = this.schedulerId(args.workflowId);
    const payload: CronFirePayload = {
      workflowId: args.workflowId,
      userId: args.userId,
      expression: args.expression,
    };

    await this.queue.upsertJobScheduler(
      schedulerId,
      { pattern: args.expression },
      {
        name: CRON_JOB_NAME,
        data: payload,
        opts: {
          removeOnComplete: { age: 3600, count: 1000 },
          removeOnFail: { age: 24 * 3600 },
        },
      },
    );
  }

  async removeRepeatableJob(workflowId: string): Promise<void> {
    await this.queue.removeJobScheduler(this.schedulerId(workflowId));
  }

  async reconcile(): Promise<void> {
    const workflows = await this.prisma.workflow.findMany({
      where: { isActive: true },
      select: { id: true, userId: true, definition: true },
    });

    const desired = new Map<string, AddRepeatableJobArgs>();
    for (const wf of workflows) {
      const cron = this.extractCronTrigger(wf.definition);
      if (!cron) {
        continue;
      }
      if (!isValidCron(cron.expression)) {
        this.log.warn(
          { workflowId: wf.id, expression: cron.expression },
          'Skipping workflow with invalid cron expression',
        );
        continue;
      }
      desired.set(this.schedulerId(wf.id), {
        workflowId: wf.id,
        expression: cron.expression,
        userId: wf.userId,
      });
    }

    for (const args of desired.values()) {
      await this.addRepeatableJob(args);
    }

    const existing = (await this.queue.getJobSchedulers()) as JobSchedulerSummary[];
    for (const scheduler of existing) {
      if (!scheduler.key.startsWith(CRON_SCHEDULER_PREFIX)) {
        continue;
      }
      if (!desired.has(scheduler.key)) {
        await this.queue.removeJobScheduler(scheduler.key);
        this.log.log({ schedulerId: scheduler.key }, 'Removed orphaned cron scheduler');
      }
    }
  }

  private schedulerId(workflowId: string): string {
    return `${CRON_SCHEDULER_PREFIX}${workflowId}`;
  }

  private extractCronTrigger(definition: unknown): { expression: string } | null {
    const def = definition as WorkflowDefinition | null;
    if (!def || !Array.isArray(def.nodes) || def.nodes.length === 0) {
      return null;
    }
    const trigger = def.nodes[0] as WorkflowNode | undefined;
    if (!trigger || trigger.type !== CRON_TRIGGER_TYPE) {
      return null;
    }
    const expression = trigger.config?.expression;
    if (typeof expression !== 'string') {
      return null;
    }
    return { expression };
  }
}
