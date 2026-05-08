import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { isPollTriggerType, type WorkflowDefinition, type WorkflowNode } from '@tietide/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PollTriggerRegistry } from './poll-trigger.registry';
import { POLL_JOB_NAME, POLL_QUEUE_NAME, POLL_SCHEDULER_PREFIX } from './poll.constants';

export interface PollFirePayload {
  workflowId: string;
  nodeId: string;
  userId: string;
  type: string;
}

interface JobSchedulerSummary {
  key: string;
}

interface PollSchedulerArgs {
  workflowId: string;
  userId: string;
  nodeId: string;
  type: string;
  intervalSeconds: number;
}

@Injectable()
export class PollSchedulerService implements OnModuleInit {
  private readonly log = new Logger(PollSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PollTriggerRegistry,
    @InjectQueue(POLL_QUEUE_NAME) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reconcile();
  }

  async reconcile(): Promise<void> {
    const workflows = await this.prisma.workflow.findMany({
      where: { isActive: true },
      select: { id: true, userId: true, definition: true },
    });

    const desired = new Map<string, PollSchedulerArgs>();
    for (const wf of workflows) {
      const nodes = this.extractPollTriggerNodes(wf.definition);
      for (const node of nodes) {
        const trigger = this.registry.get(node.type);
        if (!trigger) continue;

        const intervalOverride = this.parseIntervalOverride(node.config);
        const intervalSeconds = intervalOverride ?? trigger.defaultIntervalSeconds;

        const schedulerId = this.schedulerId(wf.id, node.id);
        desired.set(schedulerId, {
          workflowId: wf.id,
          userId: wf.userId,
          nodeId: node.id,
          type: node.type,
          intervalSeconds,
        });
      }
    }

    for (const [schedulerId, args] of desired) {
      const payload: PollFirePayload = {
        workflowId: args.workflowId,
        userId: args.userId,
        nodeId: args.nodeId,
        type: args.type,
      };
      await this.queue.upsertJobScheduler(
        schedulerId,
        { every: args.intervalSeconds * 1000 },
        {
          name: POLL_JOB_NAME,
          data: payload,
          opts: {
            removeOnComplete: { age: 3600, count: 1000 },
            removeOnFail: { age: 24 * 3600 },
          },
        },
      );
    }

    const existing = (await this.queue.getJobSchedulers()) as JobSchedulerSummary[];
    for (const scheduler of existing) {
      if (!scheduler.key.startsWith(POLL_SCHEDULER_PREFIX)) continue;
      if (!desired.has(scheduler.key)) {
        await this.queue.removeJobScheduler(scheduler.key);
        this.log.log({ schedulerId: scheduler.key }, 'Removed orphaned poll scheduler');
      }
    }
  }

  private schedulerId(workflowId: string, nodeId: string): string {
    return `${POLL_SCHEDULER_PREFIX}${workflowId}:${nodeId}`;
  }

  private extractPollTriggerNodes(definition: unknown): WorkflowNode[] {
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) return [];
    const def = definition as WorkflowDefinition;
    if (!Array.isArray(def.nodes)) return [];
    return def.nodes.filter((n) => typeof n?.type === 'string' && isPollTriggerType(n.type));
  }

  private parseIntervalOverride(config: Record<string, unknown> | undefined): number | null {
    if (!config) return null;
    const raw = config['intervalSeconds'];
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
      return raw;
    }
    return null;
  }
}
