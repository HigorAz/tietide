import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { SEAT_SYNC_JOB_NAME, SEAT_SYNC_QUEUE_NAME } from './seat-sync.constants';

/**
 * Enqueues seat reconciliation after a membership change. Kept separate from
 * BillingService so membership ops depend only on a tiny queue producer (and are
 * never blocked by a slow/failed Stripe call — the work runs async with retries).
 */
@Injectable()
export class SeatSyncService {
  constructor(@InjectQueue(SEAT_SYNC_QUEUE_NAME) private readonly queue: Queue) {}

  async enqueue(organizationId: string): Promise<void> {
    await this.queue.add(
      SEAT_SYNC_JOB_NAME,
      { organizationId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
  }
}
