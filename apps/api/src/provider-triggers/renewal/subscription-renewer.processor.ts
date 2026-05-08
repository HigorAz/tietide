import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivationService } from '../activation.service';
import { RENEWAL_LOOKAHEAD_MS, RENEWAL_QUEUE_NAME } from './subscription-renewer.constants';

@Processor(RENEWAL_QUEUE_NAME)
export class SubscriptionRenewerProcessor extends WorkerHost {
  private readonly log = new Logger(SubscriptionRenewerProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activation: ActivationService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const cutoff = new Date(Date.now() + RENEWAL_LOOKAHEAD_MS);
    const due = await this.prisma.providerSubscription.findMany({
      where: { expiresAt: { lte: cutoff, not: null } },
      select: { id: true, workflowId: true, expiresAt: true },
    });

    if (due.length === 0) {
      this.log.debug({ jobId: job.id, cutoff }, 'No subscriptions due for renewal');
      return;
    }

    this.log.log(
      { jobId: job.id, count: due.length, cutoff },
      'Renewing expiring provider subscriptions',
    );

    for (const sub of due) {
      try {
        await this.activation.renewSubscription(sub.id);
      } catch (err) {
        this.log.error(
          { subscriptionId: sub.id, workflowId: sub.workflowId, error: (err as Error).message },
          'Subscription renewal failed; will retry next tick',
        );
      }
    }
  }
}
