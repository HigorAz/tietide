import { Logger } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import {
  OAUTH_REFRESH_ONE_JOB,
  OAUTH_REFRESH_QUEUE,
  OAUTH_REFRESH_SCAN_JOB,
  REFRESH_ATTEMPTS_PER_CYCLE,
  REFRESH_LEAD_TIME_MS,
} from './oauth-refresh.constants';

export interface OAuthRefreshOnePayload {
  connectionId: string;
  provider: string;
}

@Processor(OAUTH_REFRESH_QUEUE)
export class OAuthRefreshScanProcessor extends WorkerHost {
  private readonly log = new Logger(OAuthRefreshScanProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(OAUTH_REFRESH_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<{ scheduled: number }> {
    if (job.name !== OAUTH_REFRESH_SCAN_JOB) {
      return { scheduled: 0 };
    }

    const cutoff = new Date(Date.now() + REFRESH_LEAD_TIME_MS);
    const expiring = await this.prisma.connection.findMany({
      where: {
        status: 'ACTIVE',
        refreshTokenEncrypted: { not: null },
        expiresAt: { lt: cutoff },
      },
      select: { id: true, provider: true },
    });

    let scheduled = 0;
    for (const conn of expiring) {
      const payload: OAuthRefreshOnePayload = {
        connectionId: conn.id,
        provider: conn.provider,
      };
      await this.queue.add(OAUTH_REFRESH_ONE_JOB, payload, {
        jobId: `refresh-${conn.id}`,
        attempts: REFRESH_ATTEMPTS_PER_CYCLE,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 24 * 3600 },
      });
      scheduled += 1;
    }

    this.log.log({ scheduled }, 'OAuth refresh scan complete');
    return { scheduled };
  }
}
